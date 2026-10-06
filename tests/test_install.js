const { makeApp, sleep } = require("./harness");
const makeCamEnv = require("./cam_setup");
const fs = require("fs"), nodePath = require("path");
const assert = require("assert");
const root = nodePath.resolve(process.argv[2], "..", "..");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

(async () => {
  console.log("Tapping the installed icon (/?mode=camera) with a live trip");
  let env = makeCamEnv();
  let app = makeApp(process.argv[2], { setup: env.setup, url: "https://34-176-154-19.nip.io/?mode=camera" });
  let { w } = app; let $ = s => w.document.querySelector(s);
  await sleep(900);
  ok(!$("#view-trip").classList.contains("hidden"), "lands on the live trip");
  ok(!$("#camera-view").classList.contains("hidden"), "camera is already open - zero extra taps");
  ok(env.state.calls.length === 1, "camera stream started");
  ok(w.location.search === "", "?mode=camera removed from the address, so a refresh doesn't re-trigger it");
  ok(app.log.errors.length === 0, "no errors logged");
  $("#cam-map").click();
  ok(!$("#view-trip").classList.contains("hidden") && $("#camera-view").classList.contains("hidden"), "map button -> live map (the way out to see everyone)");
  w.eval("showHome()"); await sleep(300);
  ok($$ = $("#pack-list").children.length === 2, "older hives are one tap away on the home list");
  w.close();

  console.log("Tapping the icon with NO live trip");
  env = makeCamEnv();
  app = makeApp(process.argv[2], { setup: env.setup, noActive: true, url: "https://34-176-154-19.nip.io/?mode=camera" });
  w = app.w; $ = s => w.document.querySelector(s);
  await sleep(900);
  ok(!$("#view-home").classList.contains("hidden") && $("#camera-view").classList.contains("hidden"), "goes to Home, camera stays closed");
  ok($("#home-note").textContent.includes("No live trip"), "explains why: " + $("#home-note").textContent);
  ok(env.state.calls.length === 0, "camera was never started");
  w.eval("openPlanRoute()");
  ok($("#home-note").textContent === "", "note clears once you leave Home");
  w.close();

  console.log("First time in the installed app (new storage): sign in, then camera");
  env = makeCamEnv();
  app = makeApp(process.argv[2], { setup: env.setup, noUser: true, url: "https://34-176-154-19.nip.io/?mode=camera" });
  w = app.w; $ = s => w.document.querySelector(s);
  await sleep(300);
  ok(!$("#view-setup").classList.contains("hidden"), "asks who you are once");
  $("#setup-name").value = "Sasi"; $("#setup-phone").value = "(206) 555-1234";
  w.eval("setupUser()"); await sleep(900);
  ok(!$("#camera-view").classList.contains("hidden") && !$("#view-trip").classList.contains("hidden"), "after signing in it continues straight into the camera");
  w.close();

  console.log("Install card");
  env = makeCamEnv();
  app = makeApp(process.argv[2], { setup: w2 => { env.setup(w2); w2.matchMedia = q => ({ matches: /standalone/.test(q) }); } });
  w = app.w; await sleep(150);
  ok(w.document.getElementById("install-text").textContent.includes("installed app"), "installed app says so");
  w.close();

  app = makeApp(process.argv[2], { setup: w2 => Object.defineProperty(w2.navigator, "userAgent", { value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" }) });
  w = app.w; await sleep(150);
  ok(/Share.*Add to Home Screen/.test(w.document.getElementById("install-text").textContent), "iPhone: tells you Share -> Add to Home Screen");
  ok(w.document.getElementById("install-btn").classList.contains("hidden"), "no install button on iPhone (iOS has no such API)");
  w.close();

  app = makeApp(process.argv[2], {}); w = app.w; await sleep(150);
  ok(/Install app|Add to Home screen/.test(w.document.getElementById("install-text").textContent), "Android/Chrome fallback instructions shown");
  let prompted = false;
  const ev = new w.Event("beforeinstallprompt", { cancelable: true });
  ev.prompt = () => { prompted = true; }; ev.userChoice = Promise.resolve({ outcome: "accepted" });
  w.dispatchEvent(ev); await sleep(20);
  ok(!w.document.getElementById("install-btn").classList.contains("hidden"), "Android: a real Install button appears when the browser offers it");
  w.document.getElementById("install-btn").click(); await sleep(20);
  ok(prompted, "tapping it triggers the install prompt");
  w.close();

  console.log("Manifest, icons, service worker");
  const manifest = JSON.parse(fs.readFileSync(nodePath.join(root, "public/manifest.webmanifest"), "utf8"));
  ok(manifest.start_url === "/?mode=camera", "icon opens straight to the camera: " + manifest.start_url);
  ok(manifest.display === "standalone" && manifest.scope === "/", "full-screen app, scope covers the whole site");
  ok(manifest.name && manifest.short_name && manifest.background_color && manifest.theme_color, "name, short name, colors set");
  for (const icon of manifest.icons) {
    const file = nodePath.join(root, "public", icon.src);
    ok(fs.existsSync(file), `icon file exists: ${icon.src}`);
    const buf = fs.readFileSync(file);
    const [wd, ht] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
    ok(`${wd}x${ht}` === icon.sizes, `${icon.src} really is ${icon.sizes} (header says ${wd}x${ht})`);
  }
  ok(manifest.icons.some(i => i.sizes === "192x192") && manifest.icons.some(i => i.sizes === "512x512"), "has the 192 and 512 icons Android needs");
  ok(manifest.shortcuts.some(s => s.url === "/?mode=camera"), "Android long-press shortcut: Take a photo");
  const apple = fs.readFileSync(nodePath.join(root, "public/icons/apple-touch-icon.png"));
  ok(apple.readUInt32BE(16) === 180, "iOS home-screen icon is 180px");
  const html = fs.readFileSync(process.argv[2], "utf8");
  ok(html.includes('rel="manifest" href="/manifest.webmanifest"') && html.includes('rel="apple-touch-icon"') && html.includes('apple-mobile-web-app-capable'), "page links the manifest and iOS install tags");
  const sw = fs.readFileSync(nodePath.join(root, "public/sw.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); // code only, not comments
  ok(/addEventListener\("fetch"/.test(sw) && !/respondWith/.test(sw) && !/caches\./.test(sw), "service worker intercepts and caches NOTHING (can't bring back stale pages)");
  ok(html.includes('serviceWorker.register("/sw.js")'), "service worker is registered");

  console.log(`\nALL ${n} INSTALL/LAUNCH CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
