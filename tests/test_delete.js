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
  w.document.querySelector(".photo-pin").click();
  w.eval('orbit.target = 0; animateOrbit();'); await sleep(400);
  w.document.getElementById("orbit-center").click(); await sleep(450);

  const $ = s => w.document.querySelector(s);
  ok(!$("#viewer").classList.contains("hidden"), "viewer opened on U1's own photo (m1)");
  ok(!$("#viewer-delete-btn").classList.contains("hidden"), "delete button shown for your own photo");

  w.eval("closeViewer(); orbit.open = true;");
  w.document.querySelector(".orbit-user[data-uid='U2']").click();
  w.document.getElementById("orbit-center").click(); await sleep(450);
  ok($("#viewer-name").textContent === "Susha", "now viewing Susha's photo");
  ok($("#viewer-delete-btn").classList.contains("hidden"), "delete button hidden for someone else's photo");

  w.prompt = () => null; w.confirm = () => false;
  $("#viewer-delete-btn").click();
  ok(!log.fetches.some(f => f.startsWith("DELETE")), "clicking delete on someone else's photo does nothing (button wasn't even visible, but double-check)");

  w.eval("closeViewer();");
  w.document.querySelector(".photo-pin").click();
  w.eval('orbit.target = 0; animateOrbit();'); await sleep(400);
  w.document.getElementById("orbit-center").click(); await sleep(450);
  w.confirm = () => false;
  $("#viewer-delete-btn").click();
  ok(!log.fetches.some(f => f.startsWith("DELETE")), "declining the confirm does NOT delete");

  w.confirm = () => true;
  $("#viewer-delete-btn").click();
  await sleep(100);
  ok(log.fetches.some(f => f === "DELETE /media/m1"), "confirming calls DELETE on the right photo");
  ok($("#viewer").classList.contains("hidden"), "viewer closes after deleting");

  console.log(`\nALL ${n} DELETE CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error(e.stack); process.exit(1); });
