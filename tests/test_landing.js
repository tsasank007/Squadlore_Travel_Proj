// The map IS the landing page. Everything else is under the three lines.
const { makeApp, sleep } = require("./harness");
const makeCamEnv = require("./cam_setup");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };
const path = process.argv[2];
const vis = (w, id) => !w.document.getElementById(id).classList.contains("hidden");
const T = (id, name, started, extra = {}) => ({ id, name, status: "active", left: false, started_at: started, ...extra });

(async () => {
  console.log("A live trip: the app opens on its map");
  let app = makeApp(path); let { w, log } = app;
  await sleep(900);
  ok(vis(w, "view-trip") && !vis(w, "view-home") && !vis(w, "view-landing") && !vis(w, "view-pack"), "straight to the live trip - not the hive list");
  ok(w.eval("state.tripId") === "T1", "it's the live trip (T1)");
  ok(log.maps.at(-1).container.id === "live-map", "and its map is what's on screen");
  ok(!w.document.querySelector("#view-trip .card") && !w.document.querySelector("#view-trip .back"), "no cards, no back arrow cluttering the map");
  ok(w.document.querySelectorAll("#live-legend .legend-chip").length === 2, "a who's-who strip with every member (2)");
  w.close();

  console.log("Several live trips: the newest one");
  app = makeApp(path, { trips: [T("T1", "Older trip", "2026-10-01T10:00:00Z"), T("T3", "Newer trip", "2026-10-05T10:00:00Z"), { id: "T0", name: "Ended", status: "ended", left: false, started_at: "2026-09-01" }] });
  w = app.w; await sleep(900);
  ok(w.eval("state.tripId") === "T3" && w.document.getElementById("trip-title").textContent === "Newer trip", "opens 'Newer trip', not the old one");
  w.close();

  console.log("A trip I ended for myself (it's still going for others): I keep watching it");
  app = makeApp(path, { left: true }); w = app.w; await sleep(900);
  ok(vis(w, "view-memory") && !vis(w, "view-home") && vis(w, "rejoin-trip-btn"), "opens the watch-only view with Rejoin - not the hive list");
  w.close();

  console.log("Nothing live: still a map, with a small card");
  app = makeApp(path, { noActive: true }); w = app.w; log = app.log; await sleep(900);
  ok(vis(w, "view-landing") && !vis(w, "view-home"), "the map screen, not the hive list");
  ok(log.maps.at(-1).container.id === "landing-map", "it has a real map");
  ok(/No live trip right now/.test(w.document.getElementById("landing-card").textContent), "and a card saying so");
  w.document.querySelector("#landing-card button").click(); await sleep(400);
  ok(vis(w, "view-home") && !vis(w, "view-landing"), "'Start a trip' goes to the hive list / create screen");
  ok(log.maps.filter(m => m.container.id === "landing-map").every(m => m.removed), "the landing map is cleaned up when you leave");
  w.close();

  console.log("Slow connection: tapping the menu before it finishes loading is respected");
  app = makeApp(path, { tripsDelay: 500 }); w = app.w; await sleep(100);
  w.eval("showHome()");                       // you opened "See all" while the landing lookup was still running
  await sleep(2200);
  ok(vis(w, "view-home") && !vis(w, "view-trip"), "you stay where you went - the late lookup doesn't yank you onto a trip");
  w.close();

  console.log("The menu holds everything else");
  app = makeApp(path); w = app.w; await sleep(900);
  w.document.getElementById("menu-btn").click(); await sleep(400);
  const menu = w.document.getElementById("drawer").textContent;
  ok(vis(w, "drawer-trip-card"), "'this trip' card is there on the live map");
  for (const x of ["Live trip", "Hive members", "Invite link", "Share my location now", "Trips / i'Hives", "See all / + New", "Plan a route", "Account info", "Install the app"]) ok(menu.includes(x), `menu has '${x}'`);
  const dots = [...w.document.querySelectorAll("#trip-member-list .legend-dot")].map(d => d.style.background);
  ok(dots.length === 2 && dots[0] !== dots[1], "each member shows their map colour in the menu list too");
  w.document.getElementById("menu-btn").click();
  w.eval("showHome()"); await sleep(300);
  w.document.getElementById("menu-btn").click(); await sleep(300);
  ok(!vis(w, "drawer-trip-card"), "the 'this trip' card is hidden when you're not on a live trip");
  w.close();

  console.log("Messages over the map (the status line itself is in the menu)");
  app = makeApp(path); w = app.w; await sleep(900);
  w.eval('setTripStatus("Photo uploaded!")');
  ok(vis(w, "toast") && w.document.getElementById("toast").textContent === "Photo uploaded!", "a brief message appears over the map");
  ok(w.document.getElementById("trip-status").textContent === "Photo uploaded!", "and the menu's status line is updated too");
  w.eval('showToast("short", 50)'); await sleep(150);
  ok(!vis(w, "toast"), "it goes away by itself");
  w.close();

  console.log("First time signing in");
  app = makeApp(path, { noUser: true }); w = app.w; await sleep(300);
  ok(vis(w, "view-setup"), "asks who you are first");
  w.document.getElementById("setup-name").value = "Sasi"; w.document.getElementById("setup-phone").value = "2065551234";
  w.eval("setupUser()"); await sleep(1000);
  ok(vis(w, "view-trip") && !vis(w, "view-home"), "then lands on the live map");
  w.close();

  console.log(`\nALL ${n} LANDING-PAGE CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
