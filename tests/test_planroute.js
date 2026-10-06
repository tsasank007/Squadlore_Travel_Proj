const { makeApp, sleep } = require("./harness");
const assert = require("assert");
const path = process.argv[2];
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

async function run(opts, label) {
  console.log(label);
  const app = makeApp(path, opts);
  const { w, log } = app;
  const $ = s => w.document.querySelector(s);
  await sleep(150);

  w.eval("openPlanRoute()");
  ok(!$("#view-plan").classList.contains("hidden"), "plan screen opens");
  ok(log.maps.length >= 1, "a map was created for planning");
  const planMap = log.maps.at(-1);

  $("#plan-start").value = "Seattle";
  $("#plan-end").value = "Leavenworth";
  await w.eval("previewRoute()");
  await sleep(50);
  return { w, log, $, planMap };
}

(async () => {
  let r = await run({ geocodeCoords: { "Seattle": [-122.33, 47.6], "Leavenworth": [-120.66, 47.6] } }, "Happy path: both places found, route drawn");
  ok(r.log.maps.length === 1 || r.planMap.sources["plan-route"], "route line source was added to the map");
  ok(r.planMap.sources["plan-route"].data.geometry.coordinates.length === 2, "route geometry set from the Directions response");
  ok(r.planMap.fits.length >= 1, "map fit to the route bounds");
  const status = r.$("#plan-status").textContent;
  ok(status.includes("26.1 miles") && status.includes("30 min"), "distance/time shown: " + status);
  ok(status.includes("Seattle, WA") && status.includes("Leavenworth, WA"), "both place names shown: " + status);
  ok(!r.$("#plan-use-btn").classList.contains("hidden"), "\"Use this route\" button appears on success");

  r.$("#plan-use-btn").click();
  ok(r.$("#view-home").classList.contains("hidden") === false, "returns to Home");
  ok(r.$("#new-pack-start").value === "Seattle, WA", "the start place carries into the i'Hive creation field: " + r.$("#new-pack-start").value);
  r.w.close();

  console.log("\nGeocoding failure for one place");
  r = await run({ geocodeFail: "Leavenworth" }, "");
  ok(r.log.alerts.some(a => a.includes("Leavenworth")), "a clear error names which place couldn't be found: " + r.log.alerts[0]);
  ok(r.$("#plan-use-btn").classList.contains("hidden"), "\"Use this route\" stays hidden on failure");
  r.w.close();

  console.log("\nNo route found between two valid places");
  r = await run({ directionsFail: true, geocodeCoords: { "Seattle": [-122.33, 47.6], "Leavenworth": [-120.66, 47.6] } }, "");
  ok(r.log.alerts.some(a => a.includes("Couldn't find a route")), "clear error when Directions has no route: " + r.log.alerts[0]);
  r.w.close();

  console.log(`\nALL ${n} ROUTE-PLANNING CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
