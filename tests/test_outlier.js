process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_dummy";
process.env.MAPBOX_TOKEN = "pk.test";
const assert = require("assert");
const svc = require(require("path").resolve(__dirname, "../dist/services/LocationService.js"));

// A real drive along SR522: 6 points, 30s apart, each ~500m from the last (~60km/h, normal)
const t0 = Date.parse("2026-09-28T17:00:00Z");
const real = [
  [-122.10, 47.75, 0], [-122.098, 47.752, 30], [-122.095, 47.754, 60],
  [-122.093, 47.756, 90], [-122.090, 47.758, 120], [-122.088, 47.760, 150],
].map(([lng, lat, dt]) => ({ lng, lat, t: t0 + dt * 1000 }));

// Insert ONE bad cell-tower fix between points 2 and 3: 5km away, same timestamp gap (30s) - impossible speed
const withOutlier = [...real.slice(0, 3), { lng: -122.06, lat: 47.78, t: real[2].t + 30000 }, ...real.slice(3).map(p => ({ ...p, t: p.t + 30000 }))];

const cleaned = svc.dropSpeedOutliers(withOutlier);
assert.strictEqual(cleaned.length, real.length, `outlier should be dropped: had ${withOutlier.length}, kept ${cleaned.length}`);
assert(!cleaned.some(p => p.lng === -122.06), "the bad point must not survive");
assert.deepStrictEqual(cleaned.map(p => [p.lng, p.lat]), real.map(p => [p.lng, p.lat]), "every real point is preserved, in order");
console.log("1. single bad point dropped, real route intact:", withOutlier.length, "->", cleaned.length, "points");

// Genuine highway driving (100 km/h) must NOT be flagged
const highway = [[-122.10, 47.75, 0], [-122.075, 47.75, 60], [-122.050, 47.75, 120]]
  .map(([lng, lat, dt]) => ({ lng, lat, t: t0 + dt * 1000 }));
assert.strictEqual(svc.dropSpeedOutliers(highway).length, 3, "real highway speed must survive");
console.log("2. real highway speed (~100km/h) not flagged");

// Two consecutive bad points shouldn't cancel each other out - both compared against the last GOOD point
const twoBad = [real[0], real[1], { lng: -121.5, lat: 48.5, t: real[1].t + 10000 }, { lng: -121.6, lat: 48.6, t: real[1].t + 20000 }, real[2]];
const c2 = svc.dropSpeedOutliers(twoBad);
assert.strictEqual(c2.length, 3, "both bad points dropped, got " + c2.length);
console.log("3. two consecutive bad points both dropped");

// Fewer than 3 points: nothing to compare against, left alone
assert.strictEqual(svc.dropSpeedOutliers([real[0], real[1]]).length, 2, "too few points to filter");
console.log("4. short sequences untouched");
console.log("\nALL OUTLIER TESTS PASSED");
