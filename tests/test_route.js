process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_dummy";
process.env.MAPBOX_TOKEN = "pk.test";
const assert = require("assert");
const svc = require(require("path").resolve(__dirname, "../dist/services/LocationService.js"));
const { supabase } = require(require("path").resolve(__dirname, "../dist/db/supabaseClient.js"));

let calls = [];
let mode = "ok";
global.fetch = async (url) => {
  calls.push(url);
  const coordStr = url.split("/driving/")[1].split("?")[0];
  const pts = coordStr.split(";").map(s => s.split(",").map(Number));
  if (mode === "fail") return { json: async () => ({ code: "NoRoute", message: "nope" }) };
  // pretend the road bends: add a midpoint between each pair
  const line = [];
  pts.forEach((p, i) => { line.push(p); if (i < pts.length - 1) line.push([(p[0]+pts[i+1][0])/2 + 0.0001, (p[1]+pts[i+1][1])/2]); });
  return { json: async () => ({ code: "Ok", routes: [{ geometry: { coordinates: line } }] }) };
};

(async () => {
  // 1. thinning
  const base = [-122.0, 47.7];
  const tenM = 0.0001;   // ~7.5m of longitude at this latitude
  const jitter = Array.from({ length: 20 }, (_, i) => [base[0] + i * tenM, base[1]]);
  const thinned = svc.thinPoints(jitter, 200);
  assert(thinned.length < jitter.length, "should thin jitter");
  assert.deepStrictEqual(thinned[0], jitter[0], "keeps first");
  console.log("1. thinning ok:", jitter.length, "->", thinned.length);

  // final point is always kept when it's meaningfully away
  const far = [[-122, 47.7], [-122.0005, 47.7], [-122.05, 47.7]];
  const t2 = svc.thinPoints(far, 200);
  assert.deepStrictEqual(t2[t2.length - 1], far[2]);
  console.log("   keeps the last point ok");

  // 2. chunking: 60 well-spaced waypoints => ceil(59/24)=3 requests, each <=25 waypoints
  const sixty = Array.from({ length: 60 }, (_, i) => [-122.3 + i * 0.01, 47.6 + (i % 2) * 0.002]);
  calls = [];
  const line = await svc.routeThroughPoints(sixty);
  assert.strictEqual(calls.length, 3, "expected 3 requests, got " + calls.length);
  calls.forEach(u => assert(u.split("/driving/")[1].split("?")[0].split(";").length <= 25, "chunk too big"));
  // route passes through first and last waypoint, no duplicated joint points
  const close = (a, b) => Math.abs(a[0]-b[0]) < 1e-5 && Math.abs(a[1]-b[1]) < 1e-5;
  assert(close(line[0], sixty[0]), "starts at first waypoint");
  assert(close(line[line.length - 1], sixty[59]), "ends at last waypoint");
  for (let i = 1; i < line.length; i++) assert.notDeepStrictEqual(line[i], line[i - 1], "duplicate joint at " + i);
  console.log("2. chunking ok: 60 waypoints ->", calls.length, "requests,", line.length, "route points");

  // 3. caching: same input again => no new requests
  calls = [];
  await svc.routeThroughPoints(sixty);
  assert.strictEqual(calls.length, 0, "should be fully cached");
  // a new point appended: only the last (growing) chunk is re-asked
  const sixtyOne = sixty.concat([[-122.3 + 60 * 0.01, 47.6]]);
  await svc.routeThroughPoints(sixtyOne);
  assert(calls.length <= 2, "only the tail should be re-requested, got " + calls.length);
  console.log("3. caching ok: repeat = 0 requests; one new point =", calls.length, "request(s)");

  // 4. fallback: routing fails => straight segments, and NOT cached (retried later)
  mode = "fail"; calls = [];
  const pair = [[-121.5, 47.1], [-121.4, 47.2]];
  const straight = await svc.routeThroughPoints(pair);
  assert.deepStrictEqual(straight, pair, "should fall back to straight segments");
  mode = "ok"; calls = [];
  const routed = await svc.routeThroughPoints(pair);
  assert.strictEqual(calls.length, 1, "failed chunk must be retried, not cached");
  assert(routed.length > 2, "second try should route");
  console.log("4. fallback + retry ok");

  // 5. under 2 points
  assert.deepStrictEqual(await svc.routeThroughPoints([[1, 1]]), [[1, 1]]);
  console.log("5. single point ok");

  // 6. end to end: pings + photo locations merged per user, sorted by time, private photos excluded
  supabase.rpc = async (fn) => ({ error: null, data: [
    { user_id: "A", lat: 47.60, lng: -122.30, captured_at: "2026-09-27T10:00:00Z" },
    { user_id: "A", lat: 47.70, lng: -122.20, captured_at: "2026-09-27T10:20:00Z" },
  ]});
  let queried = {};
  supabase.from = (table) => {
    const chain = { select() { return chain; }, eq(col, val) { queried[col] = val; return chain; },
      not() { return Promise.resolve({ error: null, data: [
        { user_id: "A", lat: 47.65, lng: -122.25, captured_at: "2026-09-27T10:10:00Z" },   // a photo between the two pings
        { user_id: "B", lat: 47.61, lng: -122.31, captured_at: "2026-09-27T10:05:00Z" },   // B has photos only (blocked location)
        { user_id: "B", lat: 47.66, lng: -122.11, captured_at: "2026-09-27T10:30:00Z" },
      ]}); } };
    return chain;
  };
  calls = [];
  const inst = new svc.LocationService();
  const res = await inst.getRoadRoutePerUser("T1");
  assert.strictEqual(queried.is_private, false, "must exclude private photos");
  assert(res.A && res.B, "both users get a route, even the one with photos only");
  const aUrl = calls.find(u => u.includes("-122.30000,47.60000"));
  assert(aUrl, "A's route should start at their first ping");
  const order = aUrl.split("/driving/")[1].split("?")[0].split(";");
  assert.strictEqual(order[1], "-122.25000,47.65000", "photo point sits BETWEEN the two pings, by time");
  console.log("6. end to end ok: A (2 pings + 1 photo, time-ordered), B (photos only), private excluded");
  console.log("\nALL ROUTE TESTS PASSED");
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
