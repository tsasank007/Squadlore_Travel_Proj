const { makeApp, sleep } = require("./harness");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

(async () => {
  const app = makeApp(process.argv[2]);
  const { w, log } = app;
  await sleep(150);
  w.eval("showHome()"); await sleep(300);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);
  const map = log.maps.at(-1);

  ok(map.fits.length === 1, "auto-fits once on first load, got " + map.fits.length);

  // simulate the person dragging the map themselves (a REAL user gesture has originalEvent)
  map.handlers["dragstart"].forEach(h => h({ originalEvent: { type: "pointerdown" } }));
  await sleep(6100); // next poll cycle
  ok(map.fits.length === 1, "after a user drag, the next poll must NOT re-fit, got " + map.fits.length + " fits");

  // a PROGRAMMATIC event (no originalEvent) - e.g. our own code - must not count as user interaction
  const map2name = "clean";
  w.eval("showHome()");
  w.eval("showHome()"); await sleep(300);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);
  const map2 = log.maps.at(-1);
  map2.handlers["zoomstart"].forEach(h => h({})); // no originalEvent - e.g. our own fitBounds animating
  await sleep(6100);
  ok(map2.fits.length === 2, "a programmatic zoom event must NOT freeze auto-fit, got " + map2.fits.length + " fits");

  console.log(`\nALL ${n} PAN-FREEZE CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
