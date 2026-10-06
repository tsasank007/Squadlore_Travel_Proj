const { makeApp, sleep } = require("./harness");
const assert = require("assert");
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

(async () => {
  const app = makeApp(process.argv[2]);
  const { w, log } = app;
  await sleep(150);
  w.document.querySelectorAll("#pack-list .pack-item")[0].click();
  await sleep(700);

  // Simulate: flaky network drops the first 2 upload attempts, succeeds on the 3rd
  let tries = 0;
  const realFetch = w.fetch;
  w.fetch = async (url, init) => {
    if (init && init.method === "POST" && url.includes("/media") && !url.includes("reactions")) {
      tries++;
      if (tries < 3) throw new TypeError("Load failed");
    }
    return realFetch(url, init);
  };

  const fileInput = w.document.getElementById("photo-input");
  Object.defineProperty(fileInput, "files", { value: [{ name: "x.jpg" }], configurable: true });
  w.eval('captureMedia(document.getElementById("photo-input"), "photo")');
  await sleep(50);
  ok(w.document.getElementById("trip-status").textContent.includes("retrying"), "shows a retry message, not an immediate error");
  await sleep(5000); // two backoff waits (1.5s + 3s)
  ok(tries === 3, "retried until it succeeded, made " + tries + " attempts");
  ok(log.alerts.length === 0, "no alert shown - it recovered on its own");
  ok(w.document.getElementById("trip-status").textContent.includes("uploaded"), "ends in success");

  console.log("\nGenuine server error (not a network drop) is NOT retried");
  w.fetch = async (url, init) => {
    if (init && init.method === "POST" && url.includes("/media") && !url.includes("reactions")) {
      return { ok: false, status: 500, json: async () => ({ error: "Upload failed - please try again." }) };
    }
    return realFetch(url, init);
  };
  tries = 0;
  Object.defineProperty(fileInput, "files", { value: [{ name: "y.jpg" }], configurable: true });
  w.eval('captureMedia(document.getElementById("photo-input"), "photo")');
  await sleep(300);
  ok(log.alerts.some(a => a.includes("Upload failed")), "a real server error still surfaces immediately");

  console.log(`\nALL ${n} RETRY CHECKS PASSED`);
  w.close(); process.exit(0);
})().catch(e => { console.error("\n" + e.stack); process.exit(1); });
