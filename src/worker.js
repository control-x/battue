// Worker Cloudflare – Battue : site, application et API sur un seul domaine
// Une Durable Object par battue garde l'état et le diffuse en websocket à tous les téléphones connectés.
// Accès sans compte : chaque battue a un jeton coordinateur et un jeton bénévole, envoyés dans
// l'en-tête Authorization (ils voyagent dans la partie # du lien, jamais dans l'URL côté serveur).
//
// POST /api/new {name,address,lat,lng,since,description,phone,whatsapp,photo,police} -> {id,coord,vol}
// Sous /api/r/<id>, avec Authorization: Bearer <jeton> :
// GET  /state            -> {role, info, secteurs:{A1:{s,e,n,d,f,ds,t}}, points:[{id,lat,lng,txt,t,who}]}
// GET  /log              -> {log:[{t,txt}]} journal horodaté, coordinateur seulement
// GET  /photo            -> {photo: "data:image/jpeg;base64,…"}
// GET  /ws               -> websocket : envoyer "auth <jeton>", puis reçoit l'état à chaque changement
// POST /sector  {id,s,e,n,d,f}  correction manuelle, coordinateur seulement ; d/f : heures "HH:MM"
// POST /sector/start {id,e,o,p} commence ; p : durée prévue en minutes ; o : jeton de l'appareil ; rouvrir un secteur fait : coordinateur
// POST /sector/stop  {id,o,n}   termine ; seul l'appareil qui a commencé peut arrêter
// POST /sector/done  {id,e,d,f,n} déclare un secteur déjà fait (heures saisies par le bénévole)
// POST /point   {lat,lng,txt,who}
// POST /point/delete {id}
// POST /close   clôture, coordinateur seulement : toutes les données sont supprimées
// Sans activité pendant 30 jours, la battue s'efface d'elle-même.
//
// Admin, avec Authorization: Bearer <ADMIN_TOKEN> ; jamais de contenu de battue :
// GET  /api/admin/searches -> battues ouvertes : code, dates, nombre de bénévoles connectés, de carreaux, de signalements
// POST /api/admin/close {id} -> ferme une battue par son code (même effet qu'une clôture)
// GET  /api/admin/stats    -> compteurs Analytics Engine sur 24 h, 7 et 30 jours

import { DurableObject } from "cloudflare:workers";

const json = (o, st = 200) =>
  new Response(JSON.stringify(o), { status: st, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const clip = (s, n) => String(s ?? "").slice(0, n);
const hhmm = (s) => (/^\d{2}:\d{2}$/.test(s || "") ? s : "");
const nowParis = () => new Date().toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const validId = (id) => /^[A-Z]\d{1,2}$/.test(id || "");
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
const STATUS_LABELS = { todo: "à faire", doing: "en cours", done: "fait", alert: "signalement / à refaire" };
const IDLE_MS = 30 * 24 * 3600 * 1000;
const NO_VOLUNTEER_MS = 30 * 60 * 1000;
const GONE = { error: "Recherche introuvable ou clôturée" };
// Compteurs admin : un nom d'événement, jamais de contenu
const stat = (env, event, test) => env.STATS?.writeDataPoint({ blobs: [event, test ? "test" : "réel"], indexes: [event] });
// Données gardées dans l'UE ; JURISDICTION vide en local (wrangler dev ne gère pas les juridictions)
const stubFor = (env, namespace, name) => {
  const ns = env.JURISDICTION ? namespace.jurisdiction(env.JURISDICTION) : namespace;
  return ns.get(ns.idFromName(name));
};
const searchStub = (env, id) => stubFor(env, env.SEARCH, id);
const registryStub = (env) => stubFor(env, env.REGISTRY, "registre");

// Registre des battues pour l'admin : le code et les dates, rien d'autre
export class Registry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS searches (id TEXT PRIMARY KEY, created INTEGER, test INTEGER, closed INTEGER, reason TEXT)");
  }
  add(id, created, test) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO searches (id, created, test) VALUES (?, ?, ?)", id, created, test ? 1 : 0);
  }
  close(id, reason) {
    this.ctx.storage.sql.exec("UPDATE searches SET closed = ?, reason = ? WHERE id = ? AND closed IS NULL", Date.now(), reason, id);
  }
  get(id) {
    return this.ctx.storage.sql.exec("SELECT * FROM searches WHERE id = ?", id).toArray()[0] || null;
  }
  open() {
    return this.ctx.storage.sql.exec("SELECT id, created FROM searches WHERE closed IS NULL AND test = 0 ORDER BY created DESC").toArray();
  }
}

export class Search extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.meta = await ctx.storage.get("meta"); // {info, coord, vol} ; absent = battue inexistante ou clôturée
      this.state = (await ctx.storage.get("state")) || { secteurs: {}, points: {} };
    });
  }

  // Premier passage d'un bénévole : l'invitation fonctionne, pas d'alerte « aucun bénévole »
  async noteVolunteer(role) {
    if (role !== "vol" || this.meta.volunteerSeen) return;
    this.meta.volunteerSeen = true;
    await this.ctx.storage.put("meta", this.meta);
    stat(this.env, "first-volunteer", this.meta.info.test);
  }

  // Une seule alarme par objet : la plus proche entre l'alerte « aucun bénévole » et l'effacement après 30 jours
  scheduleAlarm() {
    const due = [this.state.t + IDLE_MS];
    if (!this.meta.volunteerSeen && !this.meta.alerted) due.push(this.meta.info.created + NO_VOLUNTEER_MS);
    return this.ctx.storage.setAlarm(Math.min(...due));
  }

  roleOf(token) {
    if (!this.meta || !token) return null;
    return token === this.meta.coord ? "coord" : token === this.meta.vol ? "vol" : null;
  }

  // État visible par les bénévoles : jamais le jeton du propriétaire d'un secteur
  publicState() {
    const secteurs = {};
    for (const [id, { o, ...pub }] of Object.entries(this.state.secteurs)) secteurs[id] = pub;
    const points = Object.entries(this.state.points).map(([id, p]) => ({ id, ...p })).sort((a, b) => a.t - b.t);
    return { info: this.meta.info, secteurs, points, now: Date.now() };
  }

  // entry : ligne du journal horodaté (exportable pour la police), gardé à part car jamais diffusé
  async save(event, entry) {
    // Étapes du parcours pour l'admin : création → premier bénévole → premier carreau
    if (event === "sector" && !this.meta.sectorSeen) {
      this.meta.sectorSeen = true;
      await this.ctx.storage.put("meta", this.meta);
      stat(this.env, "first-sector", this.meta.info.test);
    }
    this.state.t = Date.now();
    await this.ctx.storage.put("state", this.state);
    if (entry) {
      const log = (await this.ctx.storage.get("log")) || [];
      log.push({ t: this.state.t, txt: entry });
      await this.ctx.storage.put("log", log);
    }
    await this.scheduleAlarm();
    stat(this.env, event, this.meta.info.test);
    const msg = JSON.stringify(this.publicState());
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()) try { ws.send(msg); } catch {}
    }
  }

  // Pour l'admin : des nombres, jamais le contenu (ni adresse, ni prénoms, ni positions)
  adminStats() {
    if (!this.meta) return null;
    const sectors = { doing: 0, done: 0, alert: 0 };
    for (const sector of Object.values(this.state.secteurs)) if (sector.s in sectors) sectors[sector.s]++;
    const roles = this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()?.role);
    return {
      created: this.meta.info.created, lastActivity: this.state.t, sectors, points: Object.keys(this.state.points).length,
      volunteersOnline: roles.filter((role) => role === "vol").length, coordOnline: roles.includes("coord"),
      volunteerSeen: !!this.meta.volunteerSeen, sectorSeen: !!this.meta.sectorSeen,
    };
  }

  async adminClose() {
    if (!this.meta) return false;
    await this.wipe("admin-close");
    return true;
  }

  async wipe(event) {
    stat(this.env, event, this.meta?.info.test);
    if (this.meta?.id) await registryStub(this.env).close(this.meta.id, event);
    for (const ws of this.ctx.getWebSockets()) try { ws.close(4004, "clôturée"); } catch {}
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.meta = undefined;
    this.state = { secteurs: {}, points: {} };
  }

  async alarm() {
    if (!this.meta) return;
    if (Date.now() >= this.state.t + IDLE_MS) return this.wipe("expire");
    if (!this.meta.volunteerSeen && !this.meta.alerted) {
      this.meta.alerted = true;
      await this.ctx.storage.put("meta", this.meta);
      stat(this.env, "no-volunteer", this.meta.info.test);
      if (!this.meta.info.test) await notify(this.env, "Battue : une recherche n'a aucun bénévole 30 minutes après sa création");
    }
    await this.scheduleAlarm();
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/init") {
      if (this.meta) return json({ error: "exists" }, 409);
      const { photo, ...meta } = await req.json();
      this.meta = meta;
      await this.ctx.storage.put("meta", meta);
      if (photo) await this.ctx.storage.put("photo", photo);
      await this.save("create", "Battue créée, départ : " + meta.info.address + (meta.info.since ? ", vue le " + meta.info.since.replace("T", " à ") : ""));
      return json({ ok: true });
    }
    if (!this.meta) return json(GONE, 404);

    // Le navigateur ne peut pas mettre d'en-tête sur un websocket : le jeton arrive dans le premier message
    if (url.pathname === "/ws") {
      if (req.headers.get("Upgrade") !== "websocket") return json({ error: "websocket attendu" }, 426);
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    const role = this.roleOf((req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
    if (!role) return json({ error: "lien" }, 403);
    await this.noteVolunteer(role);
    const isAdmin = role === "coord";

    if (req.method === "GET" && url.pathname === "/state") return json({ role, ...this.publicState(), ...(isAdmin && { vol: this.meta.vol }) });
    if (req.method === "GET" && url.pathname === "/log") {
      if (!isAdmin) return json({ error: "admin" }, 403);
      return json({ log: (await this.ctx.storage.get("log")) || [] });
    }
    if (req.method === "GET" && url.pathname === "/photo") return json({ photo: (await this.ctx.storage.get("photo")) || "" });

    if (req.method !== "POST") return json({ error: "not found" }, 404);
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }

    if (url.pathname === "/close") {
      if (!isAdmin) return json({ error: "admin" }, 403);
      await this.wipe("close");
      return json({ ok: true });
    }
    if (url.pathname === "/sector/start" || url.pathname === "/sector/stop") {
      if (!validId(b.id)) return json({ error: "id" }, 400);
      const owner = clip(b.o, 40);
      if (!owner) return json({ error: "o" }, 400);
      const cur = this.state.secteurs[b.id];
      let meta;
      if (url.pathname === "/sector/start") {
        if (cur?.s === "doing" && cur.o !== owner)
          return json({ error: "Secteur déjà en cours" + (cur.e ? " par " + cur.e : "") + " depuis " + cur.d }, 409);
        if (cur?.s === "done" && !isAdmin) return json({ error: "admin" }, 403);
        // p : durée prévue en minutes, pour signaler les binômes en retard
        meta = { s: "doing", e: clip(b.e, 60), n: cur?.n || "", d: nowParis(), f: "", ds: Date.now(), p: Math.min(240, Math.max(0, Math.round(+b.p || 0))), o: owner, t: Date.now() };
      } else {
        if (cur?.s !== "doing") return json({ error: "Ce secteur n'est pas en cours" }, 409);
        if (cur.o !== owner) return json({ error: "Seule la personne qui a commencé peut terminer" }, 403);
        meta = { ...cur, s: "done", n: b.n == null ? cur.n : clip(b.n, 300), f: nowParis(), t: Date.now() };
      }
      this.state.secteurs[b.id] = meta;
      await this.save("sector", meta.s === "doing"
        ? `Secteur ${b.id} commencé par ${meta.e}` + (meta.p ? ` (prévu ${meta.p} min)` : "")
        : `Secteur ${b.id} terminé par ${meta.e}` + (meta.n ? ` ; note : ${meta.n}` : ""));
      const { o, ...pub } = meta;
      return json({ ok: true, meta: pub });
    }
    if (url.pathname === "/sector/done") {
      if (!validId(b.id)) return json({ error: "id" }, 400);
      const cur = this.state.secteurs[b.id];
      if (cur?.s === "doing") return json({ error: "Secteur en cours" + (cur.e ? " par " + cur.e : "") }, 409);
      if (cur?.s === "done" && !isAdmin) return json({ error: "admin" }, 403);
      if (!hhmm(b.d) || !hhmm(b.f)) return json({ error: "Indiquez l'heure de début et de fin" }, 400);
      const meta = { s: "done", e: clip(b.e, 60), n: clip(b.n, 300), d: hhmm(b.d), f: hhmm(b.f), t: Date.now() };
      this.state.secteurs[b.id] = meta;
      await this.save("sector", `Secteur ${b.id} déclaré fait par ${meta.e}, de ${meta.d} à ${meta.f}` + (meta.n ? ` ; note : ${meta.n}` : ""));
      return json({ ok: true, meta });
    }
    if (url.pathname === "/sector") {
      if (!isAdmin) return json({ error: "admin" }, 403);
      if (!validId(b.id)) return json({ error: "id" }, 400);
      if (!["todo", "doing", "done", "alert"].includes(b.s)) return json({ error: "s" }, 400);
      const meta = { s: b.s, e: clip(b.e, 60), n: clip(b.n, 300), d: hhmm(b.d), f: hhmm(b.f), t: Date.now() };
      this.state.secteurs[b.id] = meta;
      await this.save("sector", `Secteur ${b.id} corrigé par le coordinateur : ${STATUS_LABELS[b.s]}` + (meta.e ? `, ${meta.e}` : "") + (meta.n ? ` ; note : ${meta.n}` : ""));
      return json({ ok: true, meta });
    }
    if (url.pathname === "/point") {
      const lat = +b.lat, lng = +b.lng;
      if (!isFinite(lat) || !isFinite(lng)) return json({ error: "pos" }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const point = { lat, lng, txt: clip(b.txt, 300), who: clip(b.who, 40), t: Date.now() };
      this.state.points[id] = point;
      await this.save("point", `Signalement${point.who ? " de " + point.who : ""} à ${lat.toFixed(5)}, ${lng.toFixed(5)} : ${point.txt}`);
      return json({ ok: true, id });
    }
    if (url.pathname === "/point/delete") {
      const point = this.state.points[clip(b.id, 40)];
      if (!point) return json({ ok: true });
      delete this.state.points[clip(b.id, 40)];
      await this.save("point-delete", `Signalement retiré (traité) : ${point.txt}`);
      return json({ ok: true });
    }
    return json({ error: "not found" }, 404);
  }

  // "auth <jeton>" ouvre la diffusion ; "ping" garde la connexion ouverte
  async webSocketMessage(ws, msg) {
    if (msg === "ping") return ws.send("pong");
    if (typeof msg === "string" && msg.startsWith("auth ")) {
      const role = this.roleOf(msg.slice(5));
      if (!role) return ws.close(4003, "lien");
      await this.noteVolunteer(role);
      ws.serializeAttachment({ role });
      ws.send(JSON.stringify({ role, ...this.publicState(), ...(role === "coord" && { vol: this.meta.vol }) }));
    }
  }
  webSocketClose(ws, code) {
    try { ws.close(code, "fin"); } catch {}
  }
}

// Création : l'adresse est géocodée dans le navigateur (Base Adresse Nationale), la photo déjà réduite
async function createSearch(req, env) {
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const lat = +b.lat, lng = +b.lng;
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "Adresse non trouvée" }, 400);
  if (b.police !== true) return json({ error: "Prévenez d'abord le 17 ou le 112" }, 400);
  const photo = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(b.photo || "") && b.photo.length < 1_000_000 ? b.photo : "";
  const whatsapp = /^https:\/\/chat\.whatsapp\.com\/\w+$/.test(b.whatsapp || "") ? b.whatsapp : "";
  const info = {
    name: clip(b.name, 60), address: clip(b.address, 200), lat, lng, since: clip(b.since, 20),
    description: clip(b.description, 1000), phone: clip(b.phone, 20).replace(/[^\d+ ]/g, ""), whatsapp,
    hasPhoto: !!photo, created: Date.now(), test: b.test === true,
  };
  const coord = randomToken(), vol = randomToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomCode();
    const r = await searchStub(env, id).fetch("https://do/init", { method: "POST", body: JSON.stringify({ id, info, coord, vol, photo }) });
    if (!r.ok) continue;
    await registryStub(env).add(id, info.created, info.test);
    return json({ id, coord, vol });
  }
  return json({ error: "Réessayez" }, 500);
}

async function handle(req, env) {
  const url = new URL(req.url);
  if (url.hostname === "app.battue.org") return Response.redirect("https://www.battue.org" + url.pathname + url.search, 301);
  if (url.pathname === "/api/new" && req.method === "POST") return createSearch(req, env);
  if (url.pathname.startsWith("/api/admin/")) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: "admin" }, 403);
    if (url.pathname === "/api/admin/stats") return adminStats(env);
    if (url.pathname === "/api/admin/searches") return adminSearches(env);
    if (url.pathname === "/api/admin/close" && req.method === "POST") return adminCloseSearch(req, env);
    return json({ error: "not found" }, 404);
  }
  const api = url.pathname.match(/^\/api\/r\/([a-z0-9]{6})(\/[a-z/]+)$/);
  if (api) {
    if (api[2] === "/init") return json({ error: "not found" }, 404);
    return searchStub(env, api[1]).fetch(new Request("https://do" + api[2], req));
  }
  if (/^\/r\/[a-z0-9]{6}\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/app", url), req));
  return env.ASSETS.fetch(req);
}

// Console admin : uniquement des compteurs d'événements (Analytics Engine), jamais le contenu d'une battue.
// Secrets : ADMIN_TOKEN (jeton de la page /admin), CF_ACCOUNT_ID et CF_API_TOKEN (droit « Account Analytics : Read »).
async function adminStats(env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN) return json({ error: "Secrets CF_ACCOUNT_ID et CF_API_TOKEN manquants" }, 500);
  const sql = async (query) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/analytics_engine/sql`, {
      method: "POST", headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, body: query + " FORMAT JSON",
    });
    if (!r.ok) throw new Error("Analytics Engine " + r.status + " : " + (await r.text()).slice(0, 200));
    return (await r.json()).data;
  };
  const counts = (days) => sql(`SELECT blob1 AS event, SUM(_sample_interval) AS n FROM battue WHERE blob2 = 'réel' AND timestamp > NOW() - INTERVAL '${days}' DAY GROUP BY event`);
  try {
    const [day, week, month, selftest] = await Promise.all([counts(1), counts(7), counts(30),
      sql("SELECT blob1 AS event, toUnixTimestamp(MAX(timestamp)) AS t FROM battue WHERE blob1 IN ('selftest-ok', 'selftest-ko') GROUP BY event")]);
    const byEvent = (rows) => Object.fromEntries(rows.map((row) => [row.event, +row.n]));
    return json({ periods: { "24 h": byEvent(day), "7 jours": byEvent(week), "30 jours": byEvent(month) },
      selftest: Object.fromEntries(selftest.map((row) => [row.event, +row.t * 1000])) });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
}

// Battues ouvertes, avec leurs nombres ; une battue déjà effacée est retirée du registre au passage
async function adminSearches(env) {
  const registry = registryStub(env);
  const rows = await registry.open();
  const searches = await Promise.all(rows.map(async (row) => {
    const stats = await searchStub(env, row.id).adminStats();
    if (!stats) await registry.close(row.id, "absent");
    return stats && { id: row.id, ...stats };
  }));
  return json({ searches: searches.filter(Boolean) });
}

// Fermeture par l'admin (abus, battue oubliée) : même effet qu'une clôture par le coordinateur
async function adminCloseSearch(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = String(body.id || "").trim().toLowerCase();
  if (!/^[a-z0-9]{6}$/.test(id)) return json({ error: "Code de battue invalide (6 caractères)" }, 400);
  const existed = await searchStub(env, id).adminClose();
  if (!existed) await registryStub(env).close(id, "absent");
  return json({ ok: true, existed });
}

// Test de bout en bout : crée, rejoint, commence un secteur, signale, clôture, vérifie la suppression
async function selfTest(env) {
  const call = async (path, token, body) => {
    const r = await handle(new Request("https://www.battue.org" + path, {
      method: body ? "POST" : "GET",
      headers: token ? { Authorization: "Bearer " + token } : {},
      body: body && JSON.stringify(body),
    }), env);
    return { status: r.status, body: await r.json() };
  };
  const expect = (ok, step) => { if (!ok) throw new Error(step); };
  const created = await call("/api/new", null, { name: "Test", address: "test", lat: 48.85, lng: 2.35, police: true, test: true });
  expect(created.status === 200, "création");
  const { id, coord, vol } = created.body;
  expect((await call(`/api/r/${id}/state`, vol)).body.role === "vol", "lien bénévole");
  expect((await call(`/api/r/${id}/state`, "faux")).status === 403, "jeton refusé");
  expect((await call(`/api/r/${id}/sector/start`, vol, { id: "G7", e: "Test", o: "robot" })).body.meta?.s === "doing", "secteur commencé");
  expect((await call(`/api/r/${id}/point`, vol, { lat: 48.85, lng: 2.35, txt: "test" })).status === 200, "signalement");
  expect((await call(`/api/r/${id}/log`, coord)).body.log?.length === 3, "journal");
  expect((await call(`/api/r/${id}/log`, vol)).status === 403, "journal refusé au bénévole");
  expect((await call(`/api/r/${id}/close`, vol, {})).status === 403, "clôture refusée au bénévole");
  expect((await call(`/api/r/${id}/close`, coord, {})).status === 200, "clôture");
  expect((await call(`/api/r/${id}/state`, coord)).status === 404, "données supprimées");
  expect((await registryStub(env).get(id))?.closed > 0, "registre à jour");
}

async function notify(env, message) {
  if (env.NTFY_TOPIC) await fetch("https://ntfy.sh/" + env.NTFY_TOPIC, { method: "POST", body: message });
}

export default {
  fetch: handle,
  async scheduled(event, env, ctx) {
    ctx.waitUntil(selfTest(env).then(() => stat(env, "selftest-ok"), (err) => {
      console.error("selftest", err);
      stat(env, "selftest-ko");
      return notify(env, "Battue : le test automatique échoue à l'étape « " + err.message + " »");
    }));
  },
};
