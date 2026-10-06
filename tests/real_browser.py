import json, re, sys
import os; os.makedirs("/tmp/shots", exist_ok=True)
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4097"
posts = []   # every media upload the page makes: (size, first bytes)
patches = []

MAPBOX_STUB = """
window.mapboxgl = (function(){
  class Map { constructor(o){ this.c=o.container; this.c.style.background='#e8e4dc'; this._h={}; setTimeout(()=>{ (this._h.load||[]).forEach(f=>f()); },30); }
    on(e,f){ (this._h[e]=this._h[e]||[]).push(f); } once(e,f){ this.on(e,f); } addControl(){} remove(){} loaded(){return true;} isStyleLoaded(){return true;}
    project(){return {x:0,y:0};} fitBounds(){} addSource(){} addLayer(){} getSource(){return {setData(){}};} }
  class Marker { constructor(o){ this.e=(o&&o.element)||document.createElement('div'); } setLngLat(){return this;} addTo(m){ m.c.appendChild(this.e); return this; } remove(){ this.e.remove(); } }
  class Bounds { extend(){return this;} isEmpty(){return true;} }
  return { Map, Marker, LngLatBounds: Bounds, NavigationControl: class{}, accessToken:'' };
})();
"""

def run(url_path, shots_prefix, do_shots):
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                            permissions=["camera", "geolocation"], geolocation={"latitude": 47.7, "longitude": -122.1})
        ctx.add_init_script("localStorage.setItem('squadlore_user', JSON.stringify({id:'U1', displayName:'Sasi'}));")
        page = ctx.new_page()
        logs = []
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)
        page.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))

        def api(route):
            req = route.request; u = req.url.replace(BASE, ""); m = req.method
            def j(data, status=200): route.fulfill(status=status, content_type="application/json", body=json.dumps(data))
            if "mapbox-gl.js" in req.url: return route.fulfill(content_type="application/javascript", body=MAPBOX_STUB)
            if "mapbox-gl.css" in req.url or "fonts.g" in req.url: return route.fulfill(content_type="text/css", body="")
            if u.startswith("/config"): return j({"mapboxToken": "pk.x"})
            if u.startswith("/packs?userId"): return j([{"id": "P1", "name": "Hive"}])
            if u == "/packs/P1/trips": return j([{"id": "T1", "name": "MomDwaraka", "status": "active"}, {"id": "T0", "name": "Old trip", "status": "ended"}])
            if u == "/packs/P1/members": return j([{"user_id": "U1", "status": "active", "users": {"display_name": "Sasi"}}])
            if u == "/packs/P1/join-link": return j({"url": "https://34-176-154-19.nip.io/?join=abc"})
            if re.match(r"/trips/T1/positions", u): return j([])
            if re.match(r"/trips/T1/road-route", u): return j({})
            if re.match(r"/trips/T1/memory-stream", u): return j({"bubbles": [], "route": []})
            if m == "POST" and re.match(r"/trips/T1/media$", u):
                body = req.post_data_buffer or b""
                jpeg_at = body.find(bytes([0xFF, 0xD8, 0xFF]))
                posts.append({"bytes": len(body), "has_jpeg_magic": jpeg_at >= 0, "declares_image_jpeg": b"image/jpeg" in body, "has_userId": b'name="userId"' in body, "has_photo_field": b'name="photo"' in body})
                return j({"id": f"m{len(posts)}"})
            if m == "POST" and u.endswith("/pings"): return route.fulfill(status=204, body="")
            if m == "PATCH" and "/location" in u: patches.append(u); return route.fulfill(status=204, body="")
            if m == "GET" and re.match(r"/trips/T1/media", u): return j([])
            if u.startswith("/sw.js") or u.startswith("/manifest") or u.startswith("/icons") or u == "/" or u.startswith("/?") or u == "/index.html":
                return route.continue_()
            return route.continue_()
        page.route("**/*", api)
        page.goto(BASE + url_path)
        do_shots(page, logs)
        b.close()
        return logs

def shots(page, logs):
    page.wait_for_timeout(1500)
    page.screenshot(path="/tmp/shots/1_camera_open.png")
    print("camera overlay visible:", page.is_visible("#camera-view"))
    print("video is actually playing:", page.evaluate("(() => { const v=document.getElementById('cam-video'); return v.readyState>=2 && v.videoWidth>0 && !v.paused; })()"))
    print("video size:", page.evaluate("document.getElementById('cam-video').videoWidth + 'x' + document.getElementById('cam-video').videoHeight"))
    for _ in range(3):
        page.click("#cam-shutter"); page.wait_for_timeout(250)
    page.wait_for_timeout(600)
    page.screenshot(path="/tmp/shots/2_after_3_shots.png")
    print("chip text:", page.inner_text("#cam-chip"))
    print("camera still open after shots:", page.is_visible("#camera-view"))
    print("uploads made:", len(posts))
    for i, x in enumerate(posts): print("  upload", i + 1, x)
    print("location patches:", len(patches))
    # layout facts about the shutter row
    rects = page.evaluate("""(() => { const r = id => { const b=document.getElementById(id).getBoundingClientRect(); return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)} };
      return { close:r('cam-close'), chip:r('cam-chip'), flip:r('cam-flip'), thumb:r('cam-thumb'), shutter:r('cam-shutter'), map:r('cam-map') }; })()""")
    print("layout (css px, viewport 390x844):")
    for k, v in rects.items(): print(f"  {k:8s}", v)
    page.click("#cam-map"); page.wait_for_timeout(500)
    page.screenshot(path="/tmp/shots/3_trip_screen_with_buttons.png")
    print("after map button: camera hidden =", not page.is_visible("#camera-view"), "| trip visible =", page.is_visible("#view-trip"))
    page.evaluate("toggleDrawer()"); page.wait_for_timeout(500)
    hit = page.evaluate("""(() => { const b = document.getElementById('camera-btn').getBoundingClientRect();
      const el = document.elementFromPoint(b.x + b.width/2, b.y + b.height/2);
      return { onTop: el.id || el.className || el.tagName, isCameraButton: !!el.closest('#camera-bar') }; })()""")
    print("with the menu open, what's on top of the camera button's spot:", hit)
    page.screenshot(path="/tmp/shots/4_menu_install_card.png")
    print("JS errors:", [l for l in logs if "PAGEERROR" in l or "error" in l.lower()][:5])

logs = run("/?mode=camera", "x", shots)
