// Replaces the old test: the camera button used to open the phone's camera app
// through a file input. It now opens the in-page camera (the file input remains
// only as a fallback - covered in test_camera.js).
const { makeApp, sleep } = require("./harness");
const makeCamEnv = require("./cam_setup");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };
(async () => {
  const env = makeCamEnv();
  const app = makeApp(process.argv[2], { setup: env.setup });
  const { w } = app;
  await sleep(150);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);
  ok(w.document.getElementById("camera-view").classList.contains("hidden"), "camera is closed until you tap the camera button");
  w.document.getElementById("camera-btn").click();
  await sleep(50);
  ok(!w.document.getElementById("camera-view").classList.contains("hidden"), "tapping the camera button opens the in-page camera");
  const videoInput = w.document.getElementById("video-input");
  let videoTriggered = false;
  videoInput.addEventListener("click", () => { videoTriggered = true; });
  w.document.getElementById("video-btn").click();
  ok(videoTriggered, "the (hidden) video button's handler is still valid JS");
  console.log(`\nALL ${n} CAMERA BUTTON CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
