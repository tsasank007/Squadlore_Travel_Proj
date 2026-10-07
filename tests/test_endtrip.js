// "End MY trip": only the person who taps it is affected; the trip keeps going
// for everyone else; they can still watch it (and everyone's photos) forever.
const { makeApp, sleep } = require("./harness");
const makeCamEnv = require("./cam_setup");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };
const path = process.argv[2];

(async () => {
  let app = makeApp(path);
  let { w, log } = app;
  const $ = s => w.document.querySelector(s);
  await sleep(150);
  w.eval("showHome()"); await sleep(300);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);

  const bodies = [];
  const origFetch = w.fetch;
  w.fetch = (u, i) => { bodies.push([u, i && i.body]); return origFetch(u, i); };
  const calls = suffix => log.fetches.filter(f => f === "POST /trips/T1/" + suffix).length;

  console.log("The red button");
  ok(!$("#end-trip-btn").hasAttribute("hidden"), "it's visible again (it only affects YOU now)");
  ok($("#end-trip-btn").getAttribute("aria-label") === "End my trip", "labelled 'End my trip'");
  ok(/\.camera-fab\[hidden\]\s*\{\s*display:\s*none/.test(require("fs").readFileSync(path, "utf8")), "(the rule that makes 'hidden' really hide is still there, for hiding it again)");

  console.log("It always asks, in plain words, and says the trip continues for others");
  let asked = null;
  w.confirm = msg => { asked = msg; return false; };
  $("#end-trip-btn").click(); await sleep(150);
  ok(asked !== null, "asks before doing anything");
  ok(/YOUR trip/.test(asked || ""), "says it's YOUR trip: " + JSON.stringify((asked || "").split("\n")[0]));
  ok(/keeps going for everyone else/.test(asked || ""), "says it keeps going for everyone else");
  ok(/rejoin/i.test(asked || ""), "says you can rejoin");
  ok(!/EVERYONE in the hive/.test(asked || ""), "no longer talks about ending it for everyone");
  ok(calls("leave") === 0 && calls("end") === 0, "answering No does nothing");
  ok(!$("#view-trip").classList.contains("hidden"), "you stay on the live trip");

  console.log("Yes: ends only YOUR part");
  w.confirm = () => true;
  $("#end-trip-btn").click(); await sleep(500);
  ok(calls("leave") === 1, "one 'leave' request");
  ok(calls("end") === 0, "NO request to end the whole trip is ever sent");
  const leaveBody = bodies.find(b => b[0].endsWith("/trips/T1/leave"));
  ok(leaveBody && JSON.parse(leaveBody[1]).userId === "U1", "it says WHICH person is leaving");
  ok(!$("#view-memory").classList.contains("hidden"), "you land on the trip view (Memory Stream) - still able to watch");

  console.log("In that view: banner + Rejoin, not Resume");
  ok(!$("#memory-banner").classList.contains("hidden") && /still travelling/.test($("#memory-banner").textContent), "banner: the others are still travelling");
  ok(!$("#rejoin-trip-btn").classList.contains("hidden"), "a Rejoin button is shown");
  ok($("#resume-trip-btn").classList.contains("hidden"), "the whole-trip Resume button is NOT shown");
  ok(!!$("#map") && !!$("#bubble-list"), "the map and photos are right there to keep watching");

  console.log("Rejoin");
  $("#rejoin-trip-btn").click(); await sleep(500);
  ok(calls("rejoin") === 1, "one 'rejoin' request");
  const rjBody = bodies.find(b => b[0].endsWith("/trips/T1/rejoin"));
  ok(rjBody && JSON.parse(rjBody[1]).userId === "U1", "says which person is rejoining");
  ok(!$("#view-trip").classList.contains("hidden") && !!$("#camera-btn"), "back on the live trip with the camera");
  w.close();

  console.log("When the WHOLE trip was ended (rare - done by hand), Resume is the button");
  app = makeApp(path, { noActive: true }); w = app.w; log = app.log;
  await sleep(150);
  w.eval("showHome()"); await sleep(300);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click(); await sleep(700);
  ok(!w.document.querySelector("#resume-trip-btn").classList.contains("hidden") && w.document.querySelector("#rejoin-trip-btn").classList.contains("hidden") && w.document.querySelector("#memory-banner").classList.contains("hidden"), "ended trip: Resume shown, no Rejoin, no 'you ended' banner");
  w.close();

  console.log("A trip I ended (still going for others) is handled everywhere");
  const env = makeCamEnv();
  app = makeApp(path, { left: true, setup: env.setup }); w = app.w; log = app.log;
  await sleep(300);
  w.eval("showHome()"); await sleep(300);
  const rows = [...w.document.querySelectorAll("#pack-list .pack-item")];
  ok(rows[0].textContent.includes("you ended") && !rows[0].textContent.includes("live"), "Home shows it as 'you ended', not 'live': " + rows[0].textContent.trim());
  ok(log.fetches.some(f => f.includes("/packs/P1/trips?userId=U1")), "the app asks the server about trips as YOU (so it knows)");
  rows[0].click(); await sleep(700);
  ok(!w.document.querySelector("#view-memory").classList.contains("hidden") && !w.document.querySelector("#rejoin-trip-btn").classList.contains("hidden"), "tapping it opens the watch-only view with Rejoin, not the live camera screen");
  w.eval('openPack("P1","Hive")'); await sleep(500);
  ok(!w.document.querySelector("#view-pack").classList.contains("hidden"), "opening the hive doesn't force you back into a trip you ended");
  ok(w.document.querySelector("#trip-list").textContent.includes("you ended"), "it's listed under past trips as 'you ended'");
  w.close();

  console.log("The home-screen icon doesn't throw you into a camera for a trip you ended");
  app = makeApp(path, { left: true, setup: makeCamEnv().setup, url: "https://34-176-154-19.nip.io/?mode=camera" }); w = app.w;
  await sleep(1000);
  ok(w.document.querySelector("#camera-view").classList.contains("hidden") && !w.document.querySelector("#view-landing").classList.contains("hidden"), "lands on the map screen (no live trip for you), camera stays closed");
  ok(/No live trip right now - start one to use the camera/.test(w.document.querySelector("#landing-note").textContent), "and says why");
  w.close();

  console.log(`\nALL ${n} INDIVIDUAL-END CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
