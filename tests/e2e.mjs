// Tests de bout en bout contre un serveur local, hors production.
// Lancer `npx wrangler@4 dev` (avec .dev.vars, voir le README), puis : node tests/e2e.mjs
// Variables : BASE (défaut http://localhost:8787), ADMIN_TOKEN (défaut test-admin).
const BASE = process.env.BASE || "http://localhost:8787";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "test-admin";

let failures = 0;
function check(ok, name) {
  console.log((ok ? "ok     " : "ÉCHEC  ") + name);
  if (!ok) failures++;
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const within = (promise, ms) => Promise.race([promise, wait(ms).then(() => "délai dépassé")]);

async function api(path, { method = "GET", token, body } = {}) {
  const response = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const newSearch = async () => (await api("/api/new", { method: "POST", body: { name: "Test", address: "1 Rue de la Paix 75002 Paris", lat: 48.869, lng: 2.331, police: true } })).body;

function openSocket(id) {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + `/api/r/${id}/ws`);
  const messages = [];
  ws.onmessage = (event) => messages.push(event.data);
  const closed = new Promise((resolve) => (ws.onclose = (event) => resolve(event.code)));
  const opened = new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return { ws, messages, closed, opened };
}

const search = await newSearch();
check(/^[a-z0-9]{6}$/.test(search.id || ""), "création d'une battue");

// Websocket authentifié : l'état arrive après « auth », avec le rôle
const volunteer = openSocket(search.id);
await volunteer.opened;
volunteer.ws.send(`auth ${search.vol} appareil-test`);
await wait(800);
const firstState = JSON.parse(volunteer.messages[0] || "{}");
check(firstState.role === "vol" && !!firstState.secteurs, "websocket : état reçu après authentification");

// Jeton invalide : refermé avec 4003
const intruder = openSocket(search.id);
await intruder.opened;
intruder.ws.send("auth faux-jeton x");
check((await within(intruder.closed, 5000)) === 4003, "websocket : jeton invalide refermé (4003)");

// Pas d'authentification : le serveur referme après 10 s (4001) ; côté client, la fermeture peut arriver
// une dizaine de secondes plus tard, le temps de la poignée de main de fermeture
const silent = openSocket(search.id);
await silent.opened;
const silentCode = await within(silent.closed, 40000);
check(silentCode === 4001 && silent.messages.length === 0, `websocket : connexion sans authentification refermée (reçu ${silentCode})`);

// Deux téléphones prennent le même carreau au même instant : un seul l'obtient
const [first, second] = await Promise.all(["appareil-1", "appareil-2"].map((device) =>
  api(`/api/r/${search.id}/sector/start`, { method: "POST", token: search.vol, body: { id: "G7", e: device, o: device, p: 60 } })));
check([first.status, second.status].sort().join() === "200,409", `carreau pris en même temps : un succès, un refus (${first.status}, ${second.status})`);

// Signalement hors bornes refusé, signalement valide accepté
check((await api(`/api/r/${search.id}/point`, { method: "POST", token: search.vol, body: { lat: 120, lng: 2.3, txt: "x" } })).status === 400, "signalement hors bornes refusé");
check((await api(`/api/r/${search.id}/point`, { method: "POST", token: search.vol, body: { lat: 48.87, lng: 2.33, txt: "x" } })).status === 200, "signalement valide accepté");

// Abus : battue inexistante refusée, motif visible dans l'admin, débit limité
check((await api("/api/report", { method: "POST", body: { id: "zzzzzz", reason: "x" } })).status === 404, "abus : battue inexistante refusée");
check((await api("/api/report", { method: "POST", body: { id: search.id, reason: "Motif de test" } })).status === 200, "abus : signalement accepté");
const admin = await api("/api/admin/searches", { token: ADMIN_TOKEN });
const listed = (admin.body.searches || []).find((row) => row.id === search.id);
check(listed?.reports?.[0]?.reason === "Motif de test", "abus : motif visible dans l'admin");
const burst = await Promise.all(Array.from({ length: 8 }, () => api("/api/report", { method: "POST", body: { id: search.id } })));
check(burst.some((response) => response.status === 429), "abus : débit limité (429)");

// Clôture : diffusée aux téléphones (4004), données et motifs supprimés
check((await api(`/api/r/${search.id}/close`, { method: "POST", token: search.coord, body: { outcome: "found", foundByBattue: "yes" } })).status === 200, "clôture");
check((await within(volunteer.closed, 5000)) === 4004, "clôture diffusée au websocket (4004)");
// Sur une autre battue : celle-ci a épuisé sa limite de signalements juste au-dessus
const other = await newSearch();
await api(`/api/r/${other.id}/close`, { method: "POST", token: other.coord, body: {} });
check((await api("/api/report", { method: "POST", body: { id: other.id } })).status === 404, "abus : battue fermée refusée");
const history = (await api("/api/admin/history", { token: ADMIN_TOKEN })).body.history || [];
check(history.some((row) => row.outcome === "found" && row.foundByBattue === "yes") && history.every((row) => !("id" in row)), "historique : issue gardée, sans code de battue");

console.log(failures ? `\n${failures} échec(s)` : "\nTout est bon.");
process.exit(failures ? 1 : 0);
