// Ending changes exactly two fields; resuming must put exactly those back.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_dummy";
process.env.MAPBOX_TOKEN = "pk.test";
const path = require("path"), assert = require("assert");
const { supabase } = require(path.resolve(__dirname, "../dist/db/supabaseClient.js"));
const { TripService } = require(path.resolve(__dirname, "../dist/services/TripService.js"));
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

let seen = null;
supabase.from = table => ({ update: payload => { seen = { table, payload }; return { eq: (col, v) => { seen.where = [col, v]; return { select: () => ({ single: async () => ({ data: { id: v, ...payload }, error: null }) }) }; } }; } });
const svc = new TripService();

(async () => {
  await svc.endTrip("T1");
  ok(seen.table === "trips" && seen.where[1] === "T1", "end targets only that trip");
  ok(seen.payload.status === "ended" && !isNaN(Date.parse(seen.payload.ended_at)), "end sets status=ended and a real end time");
  ok(Object.keys(seen.payload).sort().join() === "ended_at,status", "end touches ONLY those two fields (nothing is deleted)");

  const r = await svc.resumeTrip("T1");
  ok(seen.where[1] === "T1" && seen.table === "trips", "resume targets only that trip");
  ok(seen.payload.status === "active", "resume sets status back to active");
  ok(seen.payload.ended_at === null, "resume CLEARS the end time (null, not omitted - an omitted field would leave it set)");
  ok(Object.keys(seen.payload).sort().join() === "ended_at,status", "resume touches only the same two fields");
  ok(r.status === "active", "returns the resumed trip");

  console.log(`\nALL ${n} TRIP-STATE CHECKS PASSED`);
})().catch(e => { console.error("\n" + e.message); process.exit(1); });
