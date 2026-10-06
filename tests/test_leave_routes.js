// "End my trip", tested through the REAL server over real HTTP, with a stand-in
// database. Proves the rules the phone can't enforce by itself.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_dummy";
process.env.MAPBOX_TOKEN = "pk.test";
process.env.PORT = "4096";
const path = require("path"), assert = require("assert");
const { supabase } = require(path.resolve(__dirname, "../dist/db/supabaseClient.js"));
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

// ---- a small in-memory database ----
const db = { trips: [{ id: "T1", pack_id: "P1", name: "Dwaraka", status: "active", started_at: "2026-10-01" }, { id: "T0", pack_id: "P1", name: "Old", status: "ended", started_at: "2026-09-01" }],
             trip_participants: [], location_pings: [], media: [] };
let participantsBroken = false, storageTouched = 0;
const PARTICIPANT_ERR = { code: "PGRST205", message: "Could not find the table 'public.trip_participants' in the schema cache" };
supabase.from = table => {
  const q = { op: "select", payload: null, filters: [], onConflict: null };
  const match = () => db[table].filter(r => q.filters.every(f => f(r)));
  const run = () => {
    if (table === "trip_participants" && participantsBroken) return { error: PARTICIPANT_ERR };
    if (q.op === "upsert") { const k = q.onConflict.split(","); const i = db[table].findIndex(r => k.every(c => r[c] === q.payload[c])); i >= 0 ? (db[table][i] = q.payload) : db[table].push(q.payload); return []; }
    if (q.op === "insert") { const row = { id: "new-" + (db[table].length + 1), ...q.payload }; db[table].push(row); return [row]; }
    if (q.op === "delete") { const gone = match(); db[table] = db[table].filter(r => !gone.includes(r)); return []; }
    return match();
  };
  const b = {
    select() { return b; }, insert(p) { q.op = "insert"; q.payload = p; return b; },
    upsert(p, o) { q.op = "upsert"; q.payload = p; q.onConflict = o.onConflict; return b; }, delete() { q.op = "delete"; return b; },
    eq(c, v) { q.filters.push(r => r[c] === v); return b; }, in(c, vs) { q.filters.push(r => vs.includes(r[c])); return b; },
    order() { return b; },
    single() { const r = run(); return Promise.resolve(r.error ? r : { data: r[0], error: null }); },
    maybeSingle() { const r = run(); return Promise.resolve(r.error ? { data: null, error: r.error } : { data: r[0] || null, error: null }); },
    then(res, rej) { const r = run(); return Promise.resolve(r.error ? { data: null, error: r.error } : { data: r, error: null }).then(res, rej); },
  };
  return b;
};
supabase.rpc = async fn => fn === "latest_ping_per_user"
  ? { data: [{ user_id: "A", lat: 1, lng: 1 }, { user_id: "B", lat: 2, lng: 2 }], error: null }
  : { data: [], error: null }; // latest_ping_for_user: no previous ping
supabase.storage = { from: () => ({ upload: async () => { storageTouched++; return { error: null }; }, getPublicUrl: p => ({ data: { publicUrl: "https://s/" + p } }) }) };

require(path.resolve(__dirname, "../dist/index.js"));
const base = "http://localhost:4096";
const post = (p, body) => fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ping = u => post("/trips/T1/pings", { userId: u, lat: 47.6, lng: -122.3, capturedAt: new Date().toISOString() });
const upload = u => { const f = new FormData(); f.append("photo", new Blob(["x"], { type: "image/jpeg" }), "a.jpg"); f.append("userId", u); f.append("capturedAt", new Date().toISOString()); return fetch(base + "/trips/T1/media", { method: "POST", body: f }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(400);
  console.log("Which version is running? The server and the app must agree");
  const health = await (await fetch(base + "/health")).json();
  const appBuild = require("fs").readFileSync(path.resolve(__dirname, "../public/index.html"), "utf8").match(/const BUILD_ID = "([^"]+)"/)[1];
  ok(health.status === "ok" && health.build === appBuild, "/health reports build " + health.build + ", the same id the app's menu shows");

  console.log("Before anyone leaves, everything works");
  ok((await ping("A")).status === 204, "A's location is accepted");
  ok((await upload("A")).status === 201, "A's photo is accepted");
  ok((await (await fetch(base + "/trips/T1/positions")).json()).length === 2, "the live map shows A and B");

  console.log("Leaving");
  ok((await post("/trips/T1/leave", {})).status === 400, "no person named = rejected");
  ok((await post("/trips/T1/leave", { userId: "A" })).status === 204, "A ends their own trip");
  ok((await post("/trips/T1/leave", { userId: "A" })).status === 204, "doing it twice is harmless");
  ok(db.trip_participants.length === 1 && db.trips[0].status === "active", "ONE person recorded; the trip itself is still ACTIVE for everyone");

  console.log("Sharing stops for the person who left - and ONLY them");
  const p1 = await ping("A"); const e1 = await p1.json();
  ok(p1.status === 409 && /Rejoin/.test(e1.error), "A's location is refused, with a clear reason: " + e1.error);
  const pingsBefore = db.location_pings.length;
  const u1 = storageTouched; const up = await upload("A");
  ok(up.status === 409, "A's photo is refused too");
  ok(storageTouched === u1, "...before anything is written to storage");
  ok((await ping("B")).status === 204, "B (still travelling) is unaffected");
  ok((await upload("B")).status === 201, "B's photos are unaffected");
  ok(db.location_pings.length === pingsBefore + 1, "only B's ping was stored");

  console.log("Everyone else keeps seeing the trip");
  const pos = await (await fetch(base + "/trips/T1/positions")).json();
  ok(pos.length === 1 && pos[0].user_id === "B", "A is no longer a live dot, B still is");
  ok(db.media.some(m => m.user_id === "A"), "A's earlier photos are still there for everyone");

  console.log("The trip list tells each person their own status");
  const asA = await (await fetch(base + "/packs/P1/trips?userId=A")).json();
  const asB = await (await fetch(base + "/packs/P1/trips?userId=B")).json();
  ok(asA.find(t => t.id === "T1").left === true, "for A: this trip is 'left'");
  ok(asB.find(t => t.id === "T1").left === false, "for B: still live");
  ok(asA.find(t => t.id === "T1").status === "active", "and its real status is still 'active' for everyone");
  const anon = await (await fetch(base + "/packs/P1/trips")).json();
  ok(anon.length === 2 && anon[0].left === undefined, "asking without a person still works (nothing breaks)");

  console.log("Rejoining");
  ok((await post("/trips/T1/rejoin", { userId: "A" })).status === 204, "A rejoins");
  ok(db.trip_participants.length === 0, "the record is removed");
  ok((await ping("A")).status === 204 && (await upload("A")).status === 201, "A can share again straight away");
  ok((await (await fetch(base + "/trips/T1/positions")).json()).length === 2, "A is back on the live map");

  console.log("SAFETY: if the one-time database step was forgotten, nothing else breaks");
  participantsBroken = true;
  ok((await ping("A")).status === 204, "location sharing still works");
  ok((await upload("A")).status === 201, "photo uploads still work");
  ok((await (await fetch(base + "/trips/T1/positions")).json()).length === 2, "the live map still works");
  const t = await fetch(base + "/packs/P1/trips?userId=A"); const tj = await t.json();
  ok(t.status === 200 && tj.length === 2, "the trip list still works");
  const lv = await post("/trips/T1/leave", { userId: "A" }); const lj = await lv.json();
  ok(lv.status === 500 && /database step/.test(lj.error), "only 'End my trip' says it isn't set up yet: " + lj.error);

  console.log(`\nALL ${n} SERVER-SIDE END-MY-TRIP CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + (e.stack || e)); process.exit(1); });
