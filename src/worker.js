// Worker Cloudflare – Battue : site, application et API sur un seul domaine
// Une Durable Object par battue garde l'état et le diffuse en websocket à tous les téléphones connectés.
// Accès sans compte : chaque battue a un jeton coordinateur et un jeton bénévole, envoyés dans
// l'en-tête Authorization (ils voyagent dans la partie # du lien, jamais dans l'URL côté serveur).
//
// POST /api/new {name,address,lat,lng,since,description,phone,whatsapp,photo,police} -> {id,coord,vol}
// POST /api/report {id,reason} -> signalement d'abus sur une battue ouverte ; motif visible dans /admin, ntfy prévenu
// Sous /api/r/<id>, avec Authorization: Bearer <jeton> :
// GET  /state            -> {role, info, secteurs:{A1:{s,e,n,d,f,ds,t}}, points:[{id,lat,lng,txt,t,who}]}
// GET  /log              -> {log:[{t,txt}]} journal horodaté, coordinateur seulement
// GET  /photo            -> {photo: "data:image/jpeg;base64,…"}
// GET  /ws               -> websocket : envoyer "auth <jeton> <appareil>", puis reçoit l'état à chaque changement
// POST /sector  {id,s,e,n,d,f}  correction manuelle, coordinateur seulement ; d/f : heures "HH:MM"
// POST /sector/start {id,e,o,p} commence ; p : durée prévue en minutes ; o : jeton de l'appareil ; rouvrir un secteur fait : coordinateur
// POST /sector/stop  {id,o,n}   termine ; seul l'appareil qui a commencé peut arrêter
// POST /sector/done  {id,e,d,f,n} déclare un secteur déjà fait (heures saisies par le bénévole)
// POST /point   {lat,lng,txt,who}
// POST /point/delete {id}
// POST /close {outcome?, foundByBattue?} clôture, coordinateur seulement : toutes les données sont supprimées ;
//                outcome "found" / "not-found" et, si retrouvée, foundByBattue "yes" / "no" / "unknown"
//                (facultatifs) rejoignent l'historique anonyme
// Sans activité pendant 30 jours, la battue s'efface d'elle-même.
//
// Admin, avec Authorization: Bearer <ADMIN_TOKEN> ; jamais de contenu de battue :
// Fiches de préparation (contenu chiffré dans le navigateur, clé dans la partie # du lien /f/<id>#<clé>) :
// POST /api/fiche {token,data} -> {id,version} ; GET, PUT {data,version}, DELETE /api/f/<id> avec Authorization: Bearer <jeton>
//
// GET  /api/admin/searches -> battues ouvertes : code, dates, nombre de bénévoles connectés, de carreaux, de signalements
// POST /api/admin/close {id} -> ferme une battue par son code (même effet qu'une clôture)
// GET  /api/admin/stats    -> compteurs Analytics Engine sur 24 h, 7 et 30 jours
// GET  /api/admin/history  -> historique anonyme des battues terminées (jour, département, durées, nombres)

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
const minutes = (ms) => (ms == null || !isFinite(ms) ? null : Math.round(ms / 60000));
const parisDay = (t) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
// Département tiré du code postal de l'adresse (2A/2B confondus en 20) ; jamais la ville ni l'adresse
const departement = (address) => {
  const m = /\b(\d{5})\b/.exec(address || "");
  return m ? (m[1].startsWith("97") ? m[1].slice(0, 3) : m[1].slice(0, 2)) : null;
};
const NO_VOLUNTEER_MS = 30 * 60 * 1000;
const AUTH_TIMEOUT_MS = 10 * 1000; // un websocket doit s'authentifier dans ce délai
const MAX_SOCKETS = 1000;
const REPORT_COOLDOWN_MS = 10 * 60 * 1000; // une notification d'abus au plus par battue dans ce délai
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
const sheetStub = (env, id) => stubFor(env, env.SHEET, "fiche:" + id);
const sha256Hex = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((x) => x.toString(16).padStart(2, "0")).join("");
const SHEET_IDLE_MS = 3 * 365 * 24 * 3600 * 1000;
const SHEET_MAX = 2_000_000;

// Fiche de préparation : un contenu chiffré dans le navigateur, illisible ici. On garde l'empreinte du jeton
// d'écriture (tiré de la clé, qui reste dans la partie # du lien) et un numéro de version contre les écrasements.
export class Sheet extends DurableObject {
  async load() {
    return (this.sheet ??= (await this.ctx.storage.get("sheet")) || null);
  }
  async touch() {
    await this.ctx.storage.setAlarm(Date.now() + SHEET_IDLE_MS);
  }
  async init(tokenHash, data) {
    if (await this.load()) return false;
    this.sheet = { tokenHash, data, version: 1, updated: Date.now() };
    await this.ctx.storage.put("sheet", this.sheet);
    await this.touch();
    return true;
  }
  async read(tokenHash) {
    const sheet = await this.load();
    if (!sheet || sheet.tokenHash !== tokenHash) return null;
    await this.touch();
    return { data: sheet.data, version: sheet.version, updated: sheet.updated };
  }
  async write(tokenHash, data, version) {
    const sheet = await this.load();
    if (!sheet || sheet.tokenHash !== tokenHash) return { status: 404 };
    if (version !== sheet.version) return { status: 409 };
    Object.assign(sheet, { data, version: sheet.version + 1, updated: Date.now() });
    await this.ctx.storage.put("sheet", sheet);
    await this.touch();
    return { status: 200, version: sheet.version };
  }
  async remove(tokenHash) {
    const sheet = await this.load();
    if (!sheet || sheet.tokenHash !== tokenHash) return false;
    await this.alarm();
    return true;
  }
  async alarm() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    this.sheet = null;
  }
}

// Registre des battues pour l'admin : le code et les dates, rien d'autre
export class Registry extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS searches (id TEXT PRIMARY KEY, created INTEGER, test INTEGER, closed INTEGER, reason TEXT)");
    // Historique anonyme, gardé après l'effacement des battues : aucune donnée personnelle, aucun code de battue
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS history (closed INTEGER, data TEXT)");
    // Signalements d'abus d'une battue ouverte, visibles seulement dans /admin, supprimés à sa fermeture
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS reports (id TEXT, at INTEGER, reason TEXT)");
  }
  addReport(id, reason) {
    const search = this.get(id);
    if (!search || search.closed) return { open: false };
    const last = this.ctx.storage.sql.exec("SELECT MAX(at) AS at FROM reports WHERE id = ?", id).toArray()[0]?.at;
    this.ctx.storage.sql.exec("INSERT INTO reports (id, at, reason) VALUES (?, ?, ?)", id, Date.now(), reason);
    return { open: true, notify: !last || Date.now() - last > REPORT_COOLDOWN_MS };
  }
  reports(id) {
    return this.ctx.storage.sql.exec("SELECT at, reason FROM reports WHERE id = ? ORDER BY at", id).toArray();
  }
  archive(row) {
    this.ctx.storage.sql.exec("INSERT INTO history (closed, data) VALUES (?, ?)", Date.now(), JSON.stringify(row));
  }
  history() {
    return this.ctx.storage.sql.exec("SELECT data FROM history ORDER BY closed DESC LIMIT 1000").toArray().map((row) => JSON.parse(row.data));
  }
  add(id, created, test) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO searches (id, created, test) VALUES (?, ?, ?)", id, created, test ? 1 : 0);
  }
  close(id, reason) {
    this.ctx.storage.sql.exec("UPDATE searches SET closed = ?, reason = ? WHERE id = ? AND closed IS NULL", Date.now(), reason, id);
    this.ctx.storage.sql.exec("DELETE FROM reports WHERE id = ?", id);
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
  // Compteurs anonymes pour l'historique ; les identifiants d'appareil (aléatoires) disparaissent avec la battue
  stats() {
    return (this.meta.stats ||= { devices: [], peak: 0, points: 0 });
  }

  async noteDevice(device) {
    const stats = this.stats();
    const online = this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.role === "vol").length;
    let changed = online > stats.peak;
    if (changed) stats.peak = online;
    if (device && stats.devices.length < 1000 && !stats.devices.includes(device)) {
      stats.devices.push(device);
      changed = true;
    }
    if (changed) await this.ctx.storage.put("meta", this.meta);
  }

  // Résumé sans donnée personnelle : jour, département, durées, nombres
  summary(reason, answers) {
    const info = this.meta.info, stats = this.stats(), sectors = Object.values(this.state.secteurs);
    const launchDelay = info.sinceTs ? info.created - info.sinceTs : null;
    return {
      day: parisDay(info.created),
      departement: departement(info.address),
      reason,
      outcome: answers.outcome || null,
      foundByBattue: answers.foundByBattue || null,
      durationMin: minutes(Date.now() - info.created),
      activeMin: minutes((this.state.t || info.created) - info.created),
      launchDelayMin: launchDelay >= 0 && launchDelay < 7 * 24 * 3600e3 ? minutes(launchDelay) : null,
      firstVolunteerMin: this.meta.firstVolunteerAt ? minutes(this.meta.firstVolunteerAt - info.created) : null,
      firstSectorMin: this.meta.firstSectorAt ? minutes(this.meta.firstSectorAt - info.created) : null,
      phones: stats.devices.length,
      peakOnline: stats.peak,
      teams: new Set(sectors.map((sector) => sector.e).filter(Boolean)).size,
      sectorsDone: sectors.filter((sector) => sector.s === "done").length,
      sectorsAlert: sectors.filter((sector) => sector.s === "alert").length,
      lateReturns: sectors.filter((sector) => sector.s === "done" && sector.p && sector.ds && sector.t > sector.ds + sector.p * 60000).length,
      points: stats.points,
      hadPhoto: !!info.hasPhoto,
      hadWhatsapp: !!info.whatsapp,
      fromSheet: !!info.fromSheet,
      places: (info.places || []).length,
    };
  }

  async noteVolunteer(role) {
    if (role !== "vol" || this.meta.volunteerSeen) return;
    this.meta.volunteerSeen = true;
    this.meta.firstVolunteerAt = Date.now();
    await this.ctx.storage.put("meta", this.meta);
    stat(this.env, "first-volunteer", this.meta.info.test);
  }

  // Une seule alarme par objet : la plus proche entre l'alerte « aucun bénévole » et l'effacement après 30 jours
  scheduleAlarm() {
    const due = [this.state.t + IDLE_MS, ...this.pendingSockets().map((pending) => pending.since + AUTH_TIMEOUT_MS)];
    if (!this.meta.volunteerSeen && !this.meta.alerted) due.push(this.meta.info.created + NO_VOLUNTEER_MS);
    return this.ctx.storage.setAlarm(Math.min(...due));
  }

  // Websockets ouverts mais pas encore authentifiés : refermés après AUTH_TIMEOUT_MS (compatible avec l'hibernation)
  pendingSockets() {
    return this.ctx.getWebSockets().map((ws) => ({ ws, ...ws.deserializeAttachment() })).filter((socket) => !socket.role);
  }
  closeStaleSockets() {
    for (const pending of this.pendingSockets())
      if (Date.now() - (pending.since || 0) >= AUTH_TIMEOUT_MS) try { pending.ws.close(4001, "authentification attendue"); } catch {}
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
      this.meta.firstSectorAt = Date.now();
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
      if (ws.deserializeAttachment()?.role) try { ws.send(msg); } catch {}
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

  async wipe(event, answers = {}) {
    stat(this.env, event, this.meta?.info.test);
    if (this.meta && !this.meta.info.test) await registryStub(this.env).archive(this.summary(event, answers));
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
    this.closeStaleSockets();
    // L'alarme sert aussi aux websockets : l'alerte n'a lieu qu'une fois le délai réellement écoulé
    if (!this.meta.volunteerSeen && !this.meta.alerted && Date.now() >= this.meta.info.created + NO_VOLUNTEER_MS) {
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
      this.closeStaleSockets();
      if (this.ctx.getWebSockets().length >= MAX_SOCKETS) return json({ error: "Trop de connexions" }, 503);
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ since: Date.now() });
      await this.scheduleAlarm();
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
      // Issue facultative, anonyme : la personne a-t-elle été retrouvée, et grâce à la battue ?
      const outcome = ["found", "not-found"].includes(b.outcome) ? b.outcome : null;
      const foundByBattue = outcome === "found" && ["yes", "no", "unknown"].includes(b.foundByBattue) ? b.foundByBattue : null;
      await this.wipe("close", { outcome, foundByBattue });
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
      if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json({ error: "pos" }, 400);
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const point = { lat, lng, txt: clip(b.txt, 300), who: clip(b.who, 40), t: Date.now() };
      this.state.points[id] = point;
      this.stats().points++;
      await this.ctx.storage.put("meta", this.meta);
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
      const [, token, device] = msg.split(" ");
      const role = this.roleOf(token);
      if (!role) return ws.close(4003, "lien");
      await this.noteVolunteer(role);
      ws.serializeAttachment({ role });
      if (role === "vol") await this.noteDevice(clip(device, 40));
      ws.send(JSON.stringify({ role, ...this.publicState(), ...(role === "coord" && { vol: this.meta.vol }) }));
    }
  }
  webSocketClose(ws, code) {
    try { ws.close(code, "fin"); } catch {}
  }
}

// Création : l'adresse est géocodée dans le navigateur (Base Adresse Nationale), la photo déjà réduite
async function createSearch(req, env) {
  // Limite large et approximative par connexion, contre la création automatisée ; jamais de captcha
  const limit = env.CREATE_LIMITER ? await env.CREATE_LIMITER.limit({ key: req.headers.get("CF-Connecting-IP") || "local" }) : { success: true };
  if (!limit.success) return json({ error: "Trop de battues créées depuis cette connexion : réessayez dans une minute. En cas d'urgence, appelez le 17." }, 429);
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
    hasPhoto: !!photo, created: Date.now(), test: b.test === true, fromSheet: b.fromSheet === true,
    // Lieux du passé venus de la fiche : à visiter en priorité
    places: (Array.isArray(b.places) ? b.places : []).slice(0, 12)
      .filter((place) => isFinite(place?.lat) && isFinite(place?.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180)
      .map((place) => ({ lat: +place.lat, lng: +place.lng, kind: ["home", "found", "habit"].includes(place.kind) ? place.kind : "habit", label: clip(place.label, 60) })),
  };
  if (isFinite(b.sinceTs) && b.sinceTs > info.created - IDLE_MS && b.sinceTs < info.created + 3600e3) info.sinceTs = +b.sinceTs;
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
  if (url.pathname === "/api/report" && req.method === "POST") return reportAbuse(req, env);
  if (url.pathname === "/api/fiche" && req.method === "POST") return createSheet(req, env);
  const sheetApi = url.pathname.match(/^\/api\/f\/([a-z0-9]{10})$/);
  if (sheetApi) return sheetRequest(req, env, sheetApi[1]);
  if (/^\/f\/[a-z0-9]{10}\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/fiche", url), req));
  if (url.pathname.startsWith("/api/admin/")) {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: "admin" }, 403);
    if (url.pathname === "/api/admin/stats") return adminStats(env);
    if (url.pathname === "/api/admin/searches") return adminSearches(env);
    if (url.pathname === "/api/admin/history") return json({ history: await registryStub(env).history() });
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

// Fiches de préparation. Authorization: Bearer <jeton d'écriture> ; le contenu est déjà chiffré.
async function createSheet(req, env) {
  let b;
  try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (typeof b.token !== "string" || b.token.length < 40) return json({ error: "jeton" }, 400);
  if (typeof b.data !== "string" || b.data.length > SHEET_MAX) return json({ error: "Fiche trop lourde : choisissez une photo plus petite" }, 413);
  const tokenHash = await sha256Hex(b.token);
  for (let attempt = 0; attempt < 5; attempt++) {
    const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), (x) => CODE_CHARS[x % CODE_CHARS.length]).join("");
    if (await sheetStub(env, id).init(tokenHash, b.data)) {
      stat(env, "sheet-create", b.test === true);
      return json({ id, version: 1 });
    }
  }
  return json({ error: "Réessayez" }, 500);
}

async function sheetRequest(req, env, id) {
  const tokenHash = await sha256Hex((req.headers.get("Authorization") || "").replace(/^Bearer /, ""));
  const stub = sheetStub(env, id);
  if (req.method === "GET") {
    const sheet = await stub.read(tokenHash);
    return sheet ? json(sheet) : json({ error: "Fiche introuvable : lien incomplet, ou fiche supprimée" }, 404);
  }
  if (req.method === "DELETE") return (await stub.remove(tokenHash)) ? json({ ok: true }) : json({ error: "Fiche introuvable" }, 404);
  if (req.method === "PUT") {
    let b;
    try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (typeof b.data !== "string" || b.data.length > SHEET_MAX) return json({ error: "Fiche trop lourde : choisissez une photo plus petite" }, 413);
    const result = await stub.write(tokenHash, b.data, b.version);
    if (result.status === 409) return json({ error: "La fiche a été modifiée entre-temps par un proche : rechargez la page avant d'enregistrer." }, 409);
    return result.status === 200 ? json({ ok: true, version: result.version }) : json({ error: "Fiche introuvable" }, 404);
  }
  return json({ error: "not found" }, 404);
}

// Signalement d'abus depuis une carte : le motif est gardé dans le registre (visible dans /admin, supprimé à la fermeture),
// l'admin est prévenu par ntfy avec le seul code de la battue, au plus une fois par REPORT_COOLDOWN_MS.
async function reportAbuse(req, env) {
  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const id = String(body.id || "");
  if (!/^[a-z0-9]{6}$/.test(id)) return json({ error: "Code de battue invalide" }, 400);
  const limit = env.REPORT_LIMITER ? await env.REPORT_LIMITER.limit({ key: id }) : { success: true };
  if (!limit.success) return json({ error: "Trop de signalements pour cette battue : réessayez dans une minute." }, 429);
  const report = await registryStub(env).addReport(id, clip(body.reason, 500));
  if (!report.open) return json({ error: "Battue introuvable ou déjà fermée" }, 404);
  stat(env, "abuse-report");
  if (report.notify) await notify(env, `Battue : signalement d'abus sur la battue ${id}. Motif et fermeture : https://www.battue.org/admin`);
  return json({ ok: true });
}

// Battues ouvertes, avec leurs nombres ; une battue déjà effacée est retirée du registre au passage
async function adminSearches(env) {
  const registry = registryStub(env);
  const rows = await registry.open();
  const searches = await Promise.all(rows.map(async (row) => {
    const stats = await searchStub(env, row.id).adminStats();
    if (!stats) await registry.close(row.id, "absent");
    return stats && { id: row.id, ...stats, reports: await registry.reports(row.id) };
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
  // Fiche : création, lecture, modification, conflit de version, suppression
  const token = "t".repeat(43), auth = { Authorization: "Bearer " + token };
  const sheetCall = async (path, method, body, headers = auth) => {
    const r = await handle(new Request("https://www.battue.org" + path, { method, headers, body: body && JSON.stringify(body) }), env);
    return { status: r.status, body: await r.json() };
  };
  const sheet = await sheetCall("/api/fiche", "POST", { token, data: "chiffré", test: true }, {});
  expect(sheet.status === 200, "fiche créée");
  const sheetPath = "/api/f/" + sheet.body.id;
  expect((await sheetCall(sheetPath, "GET")).body.data === "chiffré", "fiche lue");
  expect((await sheetCall(sheetPath, "GET", null, { Authorization: "Bearer faux" })).status === 404, "fiche refusée sans le bon jeton");
  expect((await sheetCall(sheetPath, "PUT", { data: "v2", version: 1 })).body.version === 2, "fiche modifiée");
  expect((await sheetCall(sheetPath, "PUT", { data: "v3", version: 1 })).status === 409, "écrasement refusé");
  expect((await sheetCall(sheetPath, "DELETE")).status === 200, "fiche supprimée");
  expect((await sheetCall(sheetPath, "GET")).status === 404, "fiche effacée");
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
