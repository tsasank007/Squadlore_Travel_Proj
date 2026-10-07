const { makeApp, sleep } = require("./harness");
const assert = require("assert");

async function scenario(htmlPath, label, opts) {
  const app = makeApp(htmlPath, opts);
  const { w, log } = app;
  await sleep(150);                                    // boot -> home list
  w.eval("showHome()"); await sleep(300);
  const rows = w.document.querySelectorAll("#pack-list .pack-item");
  assert.strictEqual(rows.length, 2, "home should list both trips as i'Hives, got " + rows.length);
  rows[0].click();                                     // open the live trip
  await sleep(700);                                    // let map load + members + first refresh
  const polled = log.fetches.some(f => f.includes("/trips/T1/positions"));
  const photoPins = w.document.querySelectorAll("#live-map .photo-pin").length;
  const trails = log.maps.at(-1).layers.length;
  w.close();
  return { label, polled, photoPins, trails };
}

(async () => {
  const path = process.argv[2];
  // map finishes loading BEFORE the (slow) members request returns - the case that broke
  const a = await scenario(path, "map loads first, members slow", { loadDelay: 0, membersDelay: 250 });
  // and the other order
  const b = await scenario(path, "members first, map slow", { loadDelay: 250, membersDelay: 0 });
  for (const r of [a, b]) console.log(`${r.label}: polled=${r.polled} photoBubbles=${r.photoPins} trailLayers=${r.trails}`);
  const ok = [a, b].every(r => r.polled && r.photoPins === 1 && r.trails === 1);
  console.log(ok ? "LIVE MAP OK" : "LIVE MAP BROKEN");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error("TEST ERROR:", e); process.exit(2); });
