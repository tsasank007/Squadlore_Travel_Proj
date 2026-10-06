// Runs the REAL public/index.html in jsdom with a fake Mapbox and a fake server.
const { JSDOM } = require("jsdom");
const fs = require("fs");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function makeApp(htmlPath, opts = {}) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const log = { fetches: [], alerts: [], maps: [], markers: [], errors: [] };

  const dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true, url: opts.url || "https://34-176-154-19.nip.io/",
    beforeParse(window) {
      window.alert = m => log.alerts.push(m);
      window.prompt = () => null;
      window.console.error = (...a) => log.errors.push(a.map(String).join(" "));
      if (!opts.noUser) window.localStorage.setItem("squadlore_user", JSON.stringify({ id: "U1", displayName: "Sasi" }));
      window.innerWidth = 390; window.innerHeight = 700;
      Object.defineProperty(window.navigator, "geolocation", { value: {
        getCurrentPosition: ok => ok({ coords: { latitude: 47.7, longitude: -122.1 } }) } });

      // ---------- fake Mapbox ----------
      class FakeMap {
        constructor(o) {
          this.opts = o; this.container = o.container; this.handlers = {}; this.loadedFlag = false;
          this.sources = {}; this.layers = []; this.fits = [];
          log.maps.push(this);
          setTimeout(() => { this.loadedFlag = true; (this.handlers.load || []).forEach(h => h()); this.handlers.load = []; }, opts.loadDelay ?? 0);
        }
        on(ev, cb) { (this.handlers[ev] = this.handlers[ev] || []).push(cb); }
        once(ev, cb) { this.on(ev, cb); }
        addControl() {}
        remove() { this.removed = true; }
        loaded() { return this.loadedFlag; }
        isStyleLoaded() { return this.loadedFlag; }
        project(ll) { return { x: 100 + (ll[0] + 122.5) * 1000, y: 100 + (47.7 - ll[1]) * 1000 }; }
        fitBounds(b) { this.fits.push(b); }
        addSource(id, s) { this.sources[id] = { data: s.data, setData(d) { this.data = d; } }; }
        addLayer(l) { this.layers.push(l); }
        getSource(id) { return this.sources[id]; }
      }
      class FakeMarker {
        constructor(o = {}) {
          this.el = o.element || window.document.createElement("div"); // real Mapbox makes a default pin div when only {color} is given
          this.color = o.color; this.ll = null; log.markers.push(this);
        }
        setLngLat(ll) { this.ll = ll; return this; }
        addTo(map) { this.map = map; map.container.appendChild(this.el); return this; }
        remove() { this.el.remove(); }
      }
      class FakeBounds { constructor() { this.n = 0; } extend() { this.n++; return this; } isEmpty() { return this.n === 0; } }
      if (opts.setup) opts.setup(window);
      window.mapboxgl = { Map: FakeMap, Marker: FakeMarker, LngLatBounds: FakeBounds, NavigationControl: class {}, accessToken: "" };

      // ---------- fake server ----------
      const media = [
        { id: "m1", user_id: "U1", url: "https://s/u1-a.jpg", captured_at: "2026-09-27T10:00:00Z", lat: 47.6, lng: -122.3, users: { display_name: "Sasi" } },
        { id: "m2", user_id: "U1", url: "https://s/u1-b.jpg", captured_at: "2026-09-27T10:01:00Z", lat: 47.6, lng: -122.3, users: { display_name: "Sasi" } },
        { id: "m4", user_id: "U1", url: "https://s/u1-c.jpg", captured_at: "2026-09-27T10:02:00Z", lat: 47.6, lng: -122.3, users: { display_name: "Sasi" } },
        { id: "m3", user_id: "U2", url: "https://s/u2-a.jpg", captured_at: "2026-09-27T10:00:30Z", lat: 47.6, lng: -122.3, users: { display_name: "Susha" } },
      ];
      if (opts.extraVideo) media.push({ id: "m5", user_id: "U1", url: "https://s/u1-vid.mp4", captured_at: "2026-09-27T10:03:00Z", lat: 47.6, lng: -122.3, media_type: "video", users: { display_name: "Sasi" } });
      const json = (data, ok = true) => ({ ok, status: ok ? 200 : 500, statusText: "", json: async () => data, text: async () => JSON.stringify(data) });
      window.fetch = async (url, init = {}) => {
        const method = (init.method || "GET").toUpperCase();
        log.fetches.push(`${method} ${url}`);
        if (url === "/config") return json({ mapboxToken: "pk.x" });
        if (url.startsWith("/packs?userId")) return json([{ id: "P1", name: "Hive" }]);
        if (url.startsWith("/packs/P1/trips")) {
          const t1 = { id: "T1", name: "Live trip", status: "active", left: !!opts.left };   // opts.left = "I ended MY trip" (it's still active for others)
          return json(opts.noActive ? [{ id: "T0", name: "Old trip", status: "ended", left: false }] : [t1, { id: "T0", name: "Old trip", status: "ended", left: false }]);
        }
        if (url === "/packs/P1/members") {
          if (opts.membersDelay) await sleep(opts.membersDelay);
          return json([{ user_id: "U1", status: "active", role: "admin", joined_at: "1", users: { display_name: "Sasi", avatar_url: "https://s/sasi-face.jpg" } },
                       { user_id: "U2", status: "active", role: "member", joined_at: "2", users: { display_name: "Susha" } }]);
        }
        if (url === "/packs/P1/join-link") return json({ joinCode: "abc", url: "https://x/?join=abc" });
        if (/^\/trips\/T\d\/positions/.test(url)) return json([{ user_id: "U1", lat: 47.6, lng: -122.3 }]);
        if (/^\/trips\/T\d\/road-route/.test(url)) return json({ U1: [[-122.3, 47.6], [-122.29, 47.61]] });
        if (/^\/trips\/T\d\/memory-stream/.test(url)) return json({ bubbles: [{ lat: 47.6, lng: -122.3, timestamp: "x", mediaIds: opts.extraVideo ? ["m5", "m1", "m2", "m4", "m3"] : ["m1", "m2", "m4", "m3"] }], route: [] });
        if (method === "GET" && /^\/trips\/T\d\/media/.test(url)) return json(media);
        if (/^\/media\/.*\/(reactions|comments|tags)/.test(url)) return method === "PUT" ? { ok: true, status: 204, text: async () => "", json: async () => ({}) } : json(url.endsWith("reactions") ? { counts: {}, raw: [] } : []);
        if (method === "DELETE" && /^\/media\/[^/]+$/.test(url)) return { ok: true, status: 204, text: async () => "", json: async () => ({}) };
        if (method === "POST" && url === "/users") return json({ id: "U1", display_name: JSON.parse(init.body).displayName });
        if (method === "POST" && /\/trips\/[^/]+\/media$/.test(url)) {
          if (opts.uploadStatus && opts.uploadStatus() !== 200) return json({ error: "Upload failed - please try again." }, false);
          return json({ id: "new-" + (log.fetches.filter(f => /POST .*\/media$/.test(f)).length) });
        }
        if (method === "PATCH" && /\/media\/[^/]+\/location$/.test(url)) return { ok: true, status: 204, text: async () => "", json: async () => ({}) };
        if (method === "POST") return { ok: true, status: 204, text: async () => "", json: async () => ({}) };
        if (url.includes("api.mapbox.com/geocoding")) {
          const q = decodeURIComponent(url.split("/mapbox.places/")[1].split(".json")[0]);
          if (opts.geocodeFail && opts.geocodeFail === q) return json({ features: [] });
          const coordsByQuery = opts.geocodeCoords || {};
          const c = coordsByQuery[q] || [-122.0, 47.5];
          return json({ features: [{ place_name: q + ", WA", center: c }] });
        }
        if (url.includes("api.mapbox.com/directions")) {
          if (opts.directionsFail) return json({ code: "NoRoute" });
          const coordStr = url.split("/driving/")[1].split("?")[0];
          const pts = coordStr.split(";").map(s => s.split(",").map(Number));
          return json({ code: "Ok", routes: [{ geometry: { coordinates: pts }, distance: 42000, duration: 1800 }] });
        }
        return json({ error: "unhandled " + url }, false);
      };
    },
  });
  const w = dom.window;
  return { dom, w, log, ev: code => w.eval(code) };
}

module.exports = { makeApp, sleep };
