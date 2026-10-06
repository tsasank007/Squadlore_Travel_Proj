// Profile pictures: never send "null" as the person, and never claim success
// when the server refused. (A real log line - 'invalid input syntax for type
// uuid: "null"' - showed someone tried this from the menu before signing in.)
const { makeApp, sleep } = require("./harness");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };
const path = process.argv[2];
const pic = w => new w.File(["x"], "me.jpg", { type: "image/jpeg" });
const choose = (w, id) => Object.defineProperty(w.document.getElementById(id), "files", { value: [pic(w)], configurable: true });
const avatarCalls = log => log.fetches.filter(f => /\/users\/.*\/avatar/.test(f));

(async () => {
  console.log("Before anyone has signed in");
  let app = makeApp(path, { noUser: true });
  let { w, log } = app; const $ = s => w.document.querySelector(s);
  await sleep(300);
  w.document.getElementById("menu-btn").click(); await sleep(100);
  ok($("#drawer-avatar-label").classList.contains("hidden"), "the 'Change profile picture' button is hidden");
  ok($("#drawer-account").textContent === "Not signed in yet", "the menu says: " + $("#drawer-account").textContent);
  choose(w, "drawer-avatar-input"); w.eval("changeMyAvatar()"); await sleep(100);
  ok(avatarCalls(log).length === 0, "even if triggered, NO request is sent (it used to send /users/null/avatar)");
  ok(log.alerts.some(a => /Sign in first/.test(a)), "and it explains why: " + log.alerts.at(-1));
  w.close();

  console.log("Signed in: success");
  app = makeApp(path); w = app.w; log = app.log;
  await sleep(300);
  w.document.getElementById("menu-btn").click(); await sleep(100);
  ok(!w.document.getElementById("drawer-avatar-label").classList.contains("hidden"), "the button is there once you're signed in");
  choose(w, "drawer-avatar-input"); w.eval("changeMyAvatar()"); await sleep(150);
  ok(avatarCalls(log).join() === "POST /users/U1/avatar", "uploads for the right person: " + avatarCalls(log).join());
  ok(log.alerts.at(-1).startsWith("Profile picture updated"), "tells you it worked");
  w.close();

  console.log("Signed in: the server REFUSES it");
  app = makeApp(path); w = app.w; log = app.log;
  await sleep(300);
  const orig = w.fetch;
  w.fetch = (u, i) => /\/avatar/.test(u) ? Promise.resolve({ ok: false, status: 500, json: async () => ({}) }) : orig(u, i);
  choose(w, "drawer-avatar-input"); w.eval("changeMyAvatar()"); await sleep(150);
  ok(!/updated/.test(log.alerts.at(-1)) && /Couldn't update/.test(log.alerts.at(-1)), "it does NOT say 'updated': " + log.alerts.at(-1));
  w.close();

  console.log("Signed in: no connection at all");
  app = makeApp(path); w = app.w; log = app.log;
  await sleep(300);
  const orig2 = w.fetch;
  w.fetch = (u, i) => /\/avatar/.test(u) ? Promise.reject(new TypeError("Load failed")) : orig2(u, i);
  choose(w, "drawer-avatar-input"); w.eval("changeMyAvatar()"); await sleep(150);
  ok(/Couldn't update/.test(log.alerts.at(-1)), "says so plainly: " + log.alerts.at(-1));
  w.close();

  console.log("The picture chosen on the sign-in screen");
  app = makeApp(path, { noUser: true }); w = app.w; log = app.log;
  await sleep(300);
  w.document.getElementById("setup-name").value = "Sasi"; w.document.getElementById("setup-phone").value = "(206) 555-1234";
  choose(w, "setup-avatar"); w.eval("setupUser()"); await sleep(900);
  ok(avatarCalls(log).join() === "POST /users/U1/avatar", "uploaded for the new account's real id: " + avatarCalls(log).join());
  w.close();

  console.log(`\nALL ${n} PROFILE-PICTURE CHECKS PASSED`);
  process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
