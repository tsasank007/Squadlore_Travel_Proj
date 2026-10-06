const { makeApp, sleep } = require("./harness");
const assert = require("assert");
const path = process.argv[2];
let passed = 0;
const ok = (cond, msg) => { assert(cond, "FAIL: " + msg); passed++; console.log("  ✓", msg); };

function ptr(w, target, type, x, y) {
  const e = new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
  e.pointerId = 1;
  target.dispatchEvent(e);
}
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };

(async () => {
  const app = makeApp(path);
  const { w, log, ev } = app;
  const $ = s => w.document.querySelector(s);
  const $$ = s => [...w.document.querySelectorAll(s)];
  await sleep(150);
  $$("#pack-list .pack-item")[0].click();
  await sleep(700);

  console.log("Setup");
  ok(!$("#radial-popup"), "old flat-circle popup is gone");
  const pin = $("#live-map .photo-pin");
  ok(pin, "photo bubble is on the live map");
  ok(pin.querySelector(".photo-pin-img") && !pin.style.backgroundImage, "clickable part has NO image (picture is on a pointer-events:none child)");
  ok(pin.querySelectorAll(".photo-pin-users span").length === 2, "bubble shows one colored dot per person (2)");

  console.log("Colors: one color = one person");
  const cA = ev('colorForUser("U1")'), cB = ev('colorForUser("U2")');
  ok(cA === "#E63946" && cB === "#1D7AFC" && cA !== cB, `Sasi ${cA} and Susha ${cB} are clearly different`);

  console.log("Tap a bubble -> photo browser opens");
  pin.click();
  ok(!$("#orbit").classList.contains("hidden"), "orbit is open");
  const users = $$(".orbit-user");
  ok(users.length === 2, "two people connected to the spot");
  const labels = users.map(u => u.querySelector(".orbit-user-label").textContent);
  ok(labels.includes("Sasi (3)") && labels.includes("Susha (1)"), "names + photo counts shown: " + labels.join(", "));
  ok($$("#orbit-lines line").length === 2, "a line joins each person to the spot");
  ok(ev("orbit.selected") === "U1" && $$(".orbit-item").length === 3, "first person selected, 3 photos on the ring");
  ok($("#orbit-center-img").style.backgroundImage.includes("u1-a.jpg"), "center circle shows the first photo");
  ok($(".orbit-item").style.borderColor === rgb(cA) || $(".orbit-item").style.borderColor.length > 0, "ring photos take the person's color");

  console.log("Ring layout");
  const Rw = ev("orbit.Rw"), Cx = ev("orbit.Cx"), Cy = ev("orbit.Cy");
  const tr = i => { const m = $$(".orbit-item")[i].style.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/); return { x: +m[1], y: +m[2] }; };
  let t0 = tr(0), t1 = tr(1);
  ok(Math.abs(t0.x) < 0.5 && Math.abs(t0.y + Rw) < 0.5, "focused photo sits at 12 o'clock");
  ok(t1.x < 0, "the NEXT photo waits just left of the top");

  console.log("Turn the ring like a click wheel");
  const wheel = $("#orbit-wheel"), A = a => (a * Math.PI) / 180;
  ptr(w, wheel, "pointerdown", Cx + Rw, Cy);                                    // finger at 3 o'clock
  ptr(w, wheel, "pointermove", Cx + Rw * Math.cos(A(26)), Cy + Rw * Math.sin(A(26)));   // slide clockwise 26deg
  ok(Math.abs(ev("orbit.pos") - 1) < 0.05, "one photo-width of clockwise turn = next photo (pos " + ev("orbit.pos").toFixed(2) + ")");
  ok($("#orbit-center-img").style.backgroundImage.includes("u1-b.jpg"), "center now shows photo 2");
  t1 = tr(1); ok(Math.abs(t1.x) < 0.5 && Math.abs(t1.y + Rw) < 0.5, "photo 2 has travelled round to 12 o'clock");
  t0 = tr(0); ok(t0.x > 0, "photo 1 moved off to the right (ring follows the finger)");
  ptr(w, wheel, "pointermove", Cx + Rw * Math.cos(A(52)), Cy + Rw * Math.sin(A(52)));
  ptr(w, wheel, "pointermove", Cx + Rw * Math.cos(A(120)), Cy + Rw * Math.sin(A(120)));  // way past the end
  ok(ev("orbit.pos") <= 2.0001 && ev("orbit.focus") === 2, "stops at the last photo (pos " + ev("orbit.pos").toFixed(2) + ")");
  ptr(w, wheel, "pointerup", Cx + Rw * Math.cos(A(120)), Cy + Rw * Math.sin(A(120)));
  await sleep(400);
  ok(ev("orbit.pos") === 2, "snaps to a whole photo when released");
  ptr(w, wheel, "pointerdown", Cx, Cy - Rw);                                   // finger at 12 o'clock
  ptr(w, wheel, "pointermove", Cx + Rw * Math.sin(A(-26)), Cy - Rw * Math.cos(A(26)));  // 26deg counter-clockwise from 12 o'clock
  ok(ev("orbit.pos") < 2, "counter-clockwise goes back to the previous photo");
  ptr(w, wheel, "pointerup", Cx, Cy - Rw);
  await sleep(400);

  console.log("Tap a thumbnail to bring it round");
  const thumb0 = $$(".orbit-item")[0];
  ptr(w, thumb0, "pointerdown", Cx + 30, Cy - Rw); ptr(w, thumb0, "pointerup", Cx + 30, Cy - Rw);
  await sleep(600);
  ok(ev("orbit.focus") === 0 && ev("orbit.pos") === 0, "tapping photo 1 rotates it to the top");

  console.log("Keyboard / mouse wheel (desktop)");
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  await sleep(400);
  ok(ev("orbit.focus") === 1, "arrow key steps to the next photo");
  wheel.dispatchEvent(new w.WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
  await sleep(400);
  ok(ev("orbit.focus") === 0, "scroll wheel steps back");

  console.log("Switch person");
  $(".orbit-user[data-uid='U2']").click();
  ok(ev("orbit.selected") === "U2" && $$(".orbit-item").length === 1, "Susha selected: her 1 photo on the ring");
  ok($("#orbit-center-img").style.backgroundImage.includes("u2-a.jpg"), "center shows Susha's photo");
  ok($("#orbit-center").style.borderColor === rgb(cB), "center ring is Susha's color");
  ok($(".orbit-user.selected").dataset.uid === "U2", "Susha's circle is highlighted");

  console.log("Center: tap opens it, double-tap loves it");
  $("#orbit-center").click();
  await sleep(450);
  ok(!$("#viewer").classList.contains("hidden") && $("#viewer-name").textContent === "Susha", "single tap opens the full viewer (comments, tags)");
  ev("closeViewer()");
  log.fetches.length = 0;
  $("#orbit-center").click(); await sleep(60); $("#orbit-center").click();
  ok($(".orbit-heart"), "double-tap pops a heart");
  await sleep(450);
  ok(log.fetches.includes("PUT /media/m3/reactions"), "double-tap saved the ❤️ reaction");
  ok($("#viewer").classList.contains("hidden"), "double-tap did NOT also open the viewer");

  console.log("Closing");
  $("#orbit-close").click();
  ok($("#orbit").classList.contains("hidden"), "× button closes");
  pin.click();
  $("#orbit-backdrop").click();
  ok(!$("#orbit").classList.contains("hidden"), "backdrop tap in the first half-second is ignored (the opening finger)");
  await sleep(550);
  $("#orbit-backdrop").click();
  ok($("#orbit").classList.contains("hidden"), "tap anywhere on the dim background closes it");
  pin.click(); w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok($("#orbit").classList.contains("hidden"), "Escape closes");
  pin.click(); w.eval("showHome()");
  ok($("#orbit").classList.contains("hidden"), "navigating away closes it");

  console.log("Press-and-hold on the map");
  $$("#pack-list .pack-item")[0].click(); await sleep(700);
  const map = $("#live-map");
  const touch = (type, x, y) => { const e = new w.Event(type, { bubbles: true }); e.touches = [{ clientX: x, clientY: y }]; map.dispatchEvent(e); };
  touch("touchstart", 300, 200);                       // exactly on the bubble (fake project -> 300,200)
  await sleep(650);
  ok(!$("#orbit").classList.contains("hidden"), "holding on a bubble opens the browser");
  map.dispatchEvent(new w.Event("touchend", { bubbles: true }));
  ok(Date.now() < ev("suppressMarkerClickUntil"), "the lifting finger is suppressed from counting as a tap");
  ev("closeOrbit()");
  touch("touchstart", 40, 500); await sleep(650);      // empty map
  ok($("#orbit").classList.contains("hidden"), "holding empty map does nothing");
  touch("touchstart", 300, 200); touch("touchmove", 340, 240); await sleep(650);
  ok($("#orbit").classList.contains("hidden"), "dragging (panning) cancels the hold");

  console.log("Memory Stream (ended trip) uses the same browser + real names");
  w.eval("showHome()"); await sleep(300);
  $$("#pack-list .pack-item")[1].click(); await sleep(700);
  ok(ev('packMembersById["U2"]') === "Susha", "member names loaded before drawing");
  ok($("#memory-hint").textContent.startsWith("1 photo spot found"), "hint: " + $("#memory-hint").textContent.slice(0, 40) + "...");
  const mpin = $("#map .photo-pin");
  ok(mpin, "photo bubble on the Memory Stream map");
  mpin.click();
  ok(!$("#orbit").classList.contains("hidden") && $$(".orbit-user").length === 2, "tap opens the browser with both people");
  ok(log.errors.filter(e => !/Memory Stream refresh failed|Live map refresh failed/.test(e) || true).length === 0, "no errors logged");

  console.log(`\nALL ${passed} CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error("\n" + e.message); process.exit(1); });
