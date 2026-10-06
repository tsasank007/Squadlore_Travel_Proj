const { makeApp, sleep } = require("./harness");
const assert = require("assert");
const path = process.argv[2];
let n = 0;
const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

(async () => {
  const app = makeApp(path, { extraVideo: true });
  const { w, log } = app;
  const $ = s => w.document.querySelector(s);
  await sleep(150);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);

  console.log("Map bubble: a video-only first item shows the placeholder, not a broken background");
  const pin = $("#live-map .photo-pin .photo-pin-img");
  ok(pin.classList.contains("thumb-video"), "video thumbnail uses the placeholder class");
  ok(!pin.style.backgroundImage, "no backgroundImage set for a video (would be blank/broken)");

  console.log("Ring: video item renders as a placeholder, photo items still show real images");
  pin.closest(".photo-pin").click();
  const items = [...w.document.querySelectorAll(".orbit-item")];
  ok(items.length === 4, "4 items on U1's ring (3 photos + 1 video), got " + items.length);
  const vids = items.filter(i => i.querySelector(".orbit-img").classList.contains("thumb-video"));
  ok(vids.length === 1, "exactly one video placeholder on the ring");
  const photos = items.filter(i => !i.querySelector(".orbit-img").classList.contains("thumb-video"));
  ok(photos.every(i => i.querySelector(".orbit-img").style.backgroundImage.includes(".jpg")), "the photo items are unaffected");

  console.log("Opening the video in the full viewer");
  // step the ring to the video (appended last -> index 3)
  w.eval("orbit.target = 3; animateOrbit();");
  await sleep(400);
  ok(w.eval("orbit.focus") === 3, "ring focused on the video");
  ok($("#orbit-center-img").classList.contains("thumb-video"), "center circle shows the video placeholder too");
  $("#orbit-center").click();
  await sleep(450);
  ok(!$("#viewer").classList.contains("hidden"), "viewer opened");
  ok(!$("#viewer-video").classList.contains("hidden"), "the <video> element is shown");
  ok($("#viewer-image").classList.contains("hidden"), "the <img> element is hidden");
  ok($("#viewer-video").src.includes("u1-vid.mp4"), "video element points at the real file: " + $("#viewer-video").src);

  console.log("Switching back to a photo hides the video again");
  w.eval("closeViewer()");
  pin.closest(".photo-pin").click();
  w.eval("orbit.target = 0; animateOrbit();"); await sleep(400);
  $("#orbit-center").click(); await sleep(450);
  ok(!$("#viewer-image").classList.contains("hidden"), "photo shown");
  ok($("#viewer-video").classList.contains("hidden"), "video element hidden again");
  ok($("#viewer-video").src === "" || $("#viewer-video").getAttribute("src") === "", "previous video src cleared, won't keep playing behind the photo");

  console.log("Camera bar exists and is reachable on the trip screen");
  ok($("#camera-bar") && !$("#camera-bar").closest(".hidden"), "camera bar present on the live trip screen");
  ok($("#photo-input").getAttribute("accept") === "image/*" && $("#photo-input").getAttribute("capture") === "environment", "photo input opens the camera directly");
  ok($("#video-input").getAttribute("accept") === "video/*" && $("#video-input").getAttribute("capture") === "environment", "video input opens the camera in video mode");

  console.log(`\nALL ${n} VIDEO CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
