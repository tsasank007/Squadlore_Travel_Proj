const { makeApp, sleep } = require("./harness");
const makeCamEnv = require("./cam_setup");
const assert = require("assert");
const path = process.argv[2];
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

async function start(camOpts = {}, appOpts = {}) {
  const env = makeCamEnv(camOpts);
  const app = makeApp(path, { setup: env.setup, ...appOpts });
  await sleep(150);
  app.w.eval("showHome()"); await sleep(300);
  app.w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);
  app.w.document.getElementById("camera-btn").click();
  await sleep(60);
  return { ...app, env, $: s => app.w.document.querySelector(s) };
}
const posts = log => log.fetches.filter(f => /^POST .*\/trips\/T1\/media$/.test(f));

(async () => {
  console.log("Opening: asks for the back camera, no audio");
  let t = await start();
  ok(!t.$("#camera-view").classList.contains("hidden"), "camera overlay is open");
  ok(t.env.state.calls.length === 1, "camera requested once");
  const c = t.env.state.calls[0];
  ok(c.video.facingMode.ideal === "environment" && c.audio === false, "back camera, audio off");
  ok(t.$("#cam-video").srcObject === t.env.state.streams[0], "live stream attached to the preview");

  console.log("Shutter: sends immediately, stays open for the next shot");
  t.$("#cam-shutter").click(); await sleep(150);
  ok(posts(t.log).length === 1, "one upload started right after the tap");
  ok(!t.$("#camera-view").classList.contains("hidden"), "camera is STILL open (ready for the next picture, no 'Use Photo' step)");
  ok(t.$("#cam-chip").textContent.includes("1 saved"), "status says: " + t.$("#cam-chip").textContent);
  ok(t.$("#cam-thumb").style.visibility === "visible" && t.$("#cam-thumb").style.backgroundImage.includes("blob:"), "thumbnail of the last shot shown");
  ok(t.$("#cam-flash").classList.contains("go"), "shutter flash fired");

  console.log("Rapid shots all go through");
  t.$("#cam-shutter").click(); t.$("#cam-shutter").click(); t.$("#cam-shutter").click(); await sleep(250);
  ok(posts(t.log).length === 4, "4 uploads total after 4 taps, got " + posts(t.log).length);
  ok(t.$("#cam-chip").textContent.includes("4 saved"), "counter: " + t.$("#cam-chip").textContent);

  console.log("The uploaded file really is a JPEG with the right fields");
  let captured = null;
  const origFetch = t.w.fetch;
  t.w.fetch = async (url, init) => { if (init && init.body instanceof t.w.FormData && /\/media$/.test(url)) captured = init.body; return origFetch(url, init); };
  t.$("#cam-shutter").click(); await sleep(150);
  const f = captured.get("photo");
  ok(f && f.type === "image/jpeg" && f.size > 0, "file is a non-empty image/jpeg");
  ok(captured.get("userId") === "U1", "tagged with your user id");
  ok(!isNaN(Date.parse(captured.get("capturedAt"))), "capturedAt is the time of the shot");

  console.log("Location is taken at the moment of the shot and attached");
  ok(t.log.fetches.some(f => /^PATCH \/media\/new-\d+\/location$/.test(f)), "location PATCHed onto the saved photo");

  console.log("Switch camera");
  t.$("#cam-flip").click(); await sleep(60);
  ok(t.env.state.calls.at(-1).video.facingMode.ideal === "user", "flip asks for the front camera");
  ok(t.env.state.streams[0].track.stopped, "the old stream was released");
  ok(t.$("#cam-video").classList.contains("mirror"), "front camera preview is mirrored");
  t.$("#cam-flip").click(); await sleep(60);
  ok(t.env.state.calls.at(-1).video.facingMode.ideal === "environment" && !t.$("#cam-video").classList.contains("mirror"), "flip back works");

  console.log("Close with X");
  const live = t.env.state.streams.at(-1);
  t.$("#cam-close").click();
  ok(t.$("#camera-view").classList.contains("hidden"), "X closes the camera");
  ok(live.track.stopped, "camera hardware released (light goes off)");
  ok(!t.$("#view-trip").classList.contains("hidden"), "you're on the live trip screen/map underneath");
  t.w.close();

  console.log("Map button goes back to the live map");
  t = await start();
  t.$("#cam-map").click();
  ok(t.$("#camera-view").classList.contains("hidden") && !t.$("#view-trip").classList.contains("hidden"), "map button closes the camera onto the live map");
  t.w.close();

  console.log("Failed upload: no popup, shows a retry chip, retry works");
  let status = 200;
  t = await start({}, { uploadStatus: () => status });
  status = 500;
  t.$("#cam-shutter").click(); await sleep(150);
  ok(t.log.alerts.length === 0, "no alert popup interrupts shooting");
  ok(t.$("#cam-chip").textContent.includes("1 not sent") && t.$("#cam-chip").classList.contains("cam-chip-warn"), "chip warns: " + t.$("#cam-chip").textContent);
  status = 200;
  t.$("#cam-chip").click(); await sleep(150);
  ok(t.$("#cam-chip").textContent.includes("1 saved") && !t.$("#cam-chip").textContent.includes("not sent"), "tapping the chip retried and saved it: " + t.$("#cam-chip").textContent);
  t.w.close();

  console.log("Camera permission denied: clear message + phone-camera fallback");
  t = await start({ reject: "NotAllowedError" });
  ok(!t.$("#cam-fallback").classList.contains("hidden"), "fallback panel shown");
  ok(t.$("#cam-fallback-msg").textContent.includes("blocked"), "says access is blocked: " + t.$("#cam-fallback-msg").textContent);
  ok(t.$("#camera-view").classList.contains("no-stream") && t.$("#cam-chip").textContent === "Camera not available", "chip says the camera isn't available instead of 'tap the circle'");
  ok(t.w.getComputedStyle(t.$("#cam-shutter")).visibility === "hidden", "dead shutter button is hidden when there's no camera");
  let nativeClicked = false;
  t.$("#photo-input").addEventListener("click", () => { nativeClicked = true; });
  t.$("#cam-native-btn").click();
  ok(nativeClicked, "button opens the phone's own camera app (inside the tap, so it's allowed)");
  ok(t.$("#camera-view").classList.contains("hidden"), "overlay closes so the upload status is visible");
  t.w.close();

  console.log("No camera API at all (old browser)");
  t = await start({ noMediaDevices: true });
  ok(!t.$("#cam-fallback").classList.contains("hidden") && t.$("#cam-fallback-msg").textContent.includes("isn't available"), "fallback explains: " + t.$("#cam-fallback-msg").textContent);
  t.w.close();

  console.log("Closing while the permission prompt is still up doesn't leak the camera");
  t = await start({ deferred: true });
  t.$("#cam-close").click();
  t.env.state.pending(); await sleep(50);
  ok(t.env.state.streams.length === 1 && t.env.state.streams[0].track.stopped, "late-arriving stream was stopped immediately");
  t.w.close();

  console.log("Backgrounding the app releases the camera, returning restarts it");
  t = await start();
  const before = t.env.state.calls.length;
  Object.defineProperty(t.w.document, "hidden", { configurable: true, get: () => true });
  t.w.document.dispatchEvent(new t.w.Event("visibilitychange"));
  ok(t.env.state.streams[0].track.stopped, "camera released when the app is hidden");
  Object.defineProperty(t.w.document, "hidden", { configurable: true, get: () => false });
  t.w.document.dispatchEvent(new t.w.Event("visibilitychange")); await sleep(60);
  ok(t.env.state.calls.length === before + 1, "camera restarted when you come back");
  t.w.close();

  console.log("Navigating away closes it");
  t = await start();
  const s2 = t.env.state.streams.at(-1);
  t.w.eval("showHome()");
  ok(t.$("#camera-view").classList.contains("hidden") && s2.track.stopped, "going to Home closes the camera and releases it");
  t.w.close();

  console.log(`\nALL ${n} CAMERA CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
