"""
Runs the REAL app in REAL Chromium with the REAL Mapbox GL engine (offline: the
map just has a blank background, no tiles). Unlike the fake map used by the
jsdom tests, this one actually positions markers, so it can catch bugs like
"photo bubbles drift away from where the photos were taken".

Setup (once):   mkdir -p /tmp/mb && cd /tmp/mb && npm init -y && npm i mapbox-gl@3.7.0
                pip install playwright && playwright install chromium
Run:            python3 -m http.server 4097 --directory public &
                python3 tests/real_map_check.py
"""
import json, os, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4097")
MB = os.environ.get("MAPBOX_DIST", "/tmp/mb/node_modules/mapbox-gl/dist")
SHOTS = "/tmp/shots"
os.makedirs(SHOTS, exist_ok=True)

BLANK_STYLE = {"version": 8, "sources": {}, "layers": [{"id": "bg", "type": "background", "paint": {"background-color": "#e8e4dc"}}]}

# Junagadh, Gujarat - where the family trip was when this was written
HOME = (70.4579, 21.5222)
MEMBERS = [("U1", "Sasi"), ("U2", "Vasantha"), ("U3", "Ravi")]


def spot(i, dx=0.0, dy=0.0):
    return (HOME[0] + dx + i * 0.004, HOME[1] + dy + i * 0.002)


def make_data(n_spots=12):
    """n photo spots spread along a road, taken by different people."""
    media, bubbles = [], []
    for i in range(n_spots):
        uid = MEMBERS[i % 3][0]
        lng, lat = spot(i)
        mid = f"m{i}"
        media.append({"id": mid, "user_id": uid, "url": "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=",
                      "captured_at": f"2026-10-06T10:{i:02d}:00Z", "lat": lat, "lng": lng, "users": {"display_name": MEMBERS[i % 3][1]}})
        bubbles.append({"lat": lat, "lng": lng, "timestamp": "x", "mediaIds": [mid] + ([f"m{i}b"] if i % 4 == 0 else [])})
        if i % 4 == 0:
            media.append({**media[-1], "id": f"m{i}b"})
    return media, bubbles


def launch(p, signed_in=True):
    browser = p.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
                                      "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
                              permissions=["camera", "geolocation"], geolocation={"latitude": HOME[1], "longitude": HOME[0]})
    if signed_in:
        ctx.add_init_script("localStorage.setItem('squadlore_user', JSON.stringify({id:'U1', displayName:'Sasi'}));")
    return browser, ctx


def install_routes(page, media, bubbles, trips=None, state=None):
    state = state if state is not None else {}
    trips = trips or [{"id": "T1", "name": "DwarakaTripAll", "status": "active", "left": False}]

    def api(route):
        req = route.request
        url = req.url
        u = url.replace(BASE, "")
        m = req.method
        j = lambda d, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(d))
        if url.endswith("mapbox-gl.js"):
            return route.fulfill(content_type="application/javascript", body=open(f"{MB}/mapbox-gl.js").read())
        if url.endswith("mapbox-gl.css"):
            return route.fulfill(content_type="text/css", body=open(f"{MB}/mapbox-gl.css").read())
        if "api.mapbox.com/styles/v1" in url:
            return j(BLANK_STYLE)
        if "mapbox.com" in url or "fonts.g" in url:
            return route.fulfill(status=204, body="")
        if u.startswith("/config"): return j({"mapboxToken": "pk.test"})
        if u.startswith("/packs?userId"): return j([{"id": "P1", "name": "Hive"}])
        if u.startswith("/packs/P1/trips"): return j(trips)
        if u == "/packs/P1/members":
            return j([{"user_id": uid, "status": "active", "joined_at": str(i), "users": {"display_name": name}} for i, (uid, name) in enumerate(MEMBERS)])
        if u == "/packs/P1/join-link": return j({"url": "https://x/?join=abc"})
        if re.match(r"/trips/T\d/positions", u):
            return j([{"user_id": uid, "lat": spot(i * 3)[1], "lng": spot(i * 3)[0]} for i, (uid, _) in enumerate(MEMBERS)])
        if re.match(r"/trips/T\d/road-route", u): return j({})
        if re.match(r"/trips/T\d/memory-stream", u): return j({"bubbles": bubbles, "route": []})
        if m == "GET" and re.match(r"/trips/T\d/media", u): return j(media)
        if m == "POST" and (u.endswith("/pings") or "/leave" in u or "/rejoin" in u): return route.fulfill(status=204, body="")
        if m == "POST" and re.match(r"/trips/T\d/media$", u): return j({"id": "new"})
        if m == "PATCH": return route.fulfill(status=204, body="")
        if u.startswith("/media/"): return j([])
        return route.continue_()

    page.route("**/*", api)
    return state


def marker_errors(page, which="live"):
    """For every photo marker: how far (px) is it from where the map says it should be?"""
    map_var, markers_var = ("liveMap", "livePhotoMarkers") if which == "live" else ("memoryMap", "memoryPhotoMarkers")
    return page.evaluate(f"""(() => {{
      const map = {map_var}, c = map.getContainer().getBoundingClientRect();
      return {markers_var}.map(mk => {{
        const p = map.project(mk.getLngLat()), r = mk.getElement().getBoundingClientRect();
        return {{ dx: Math.round((r.x + r.width/2 - c.x) - p.x), dy: Math.round((r.y + r.height/2 - c.y) - p.y) }};
      }});
    }})()""")


def wait_for_markers(page, which="live", timeout=15000):
    var = "livePhotoMarkers" if which == "live" else "memoryPhotoMarkers"
    page.wait_for_function(f"typeof {var} !== 'undefined' && {var}.length > 0", timeout=timeout)
    page.wait_for_timeout(500)


if __name__ == "__main__":
    media, bubbles = make_data(12)
    results = []

    def check(ok, label, detail=""):
        results.append(ok)
        print(f"  {'✓' if ok else '✗ FAIL'} {label}" + (f"  [{detail}]" if detail else ""))

    with sync_playwright() as p:
        # ---------------------------------------------------------------- live trip
        browser, ctx = launch(p)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        install_routes(page, media, bubbles)
        page.goto(BASE + "/")
        wait_for_markers(page)

        print("LANDING: the map is the first thing you see")
        check(page.is_visible("#live-map canvas") and not page.is_visible("#view-home"), "opens straight onto the live trip map, not the hive list")
        check(page.evaluate("document.getElementById('view-home').classList.contains('hidden')"), "the hive list is not the landing page")
        rect = page.evaluate("(() => { const r = document.getElementById('live-map').getBoundingClientRect(); const h = document.querySelector('header').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, headerBottom: h.bottom, vw: innerWidth, vh: innerHeight }; })()")
        check(abs(rect["x"]) < 1 and abs(rect["w"] - rect["vw"]) < 1, "the map is edge to edge", f"{rect['w']:.0f}px of {rect['vw']}px")
        check(abs(rect["y"] - rect["headerBottom"]) < 2 and abs(rect["y"] + rect["h"] - rect["vh"]) < 2, "and runs from under the header to the bottom of the screen", f"{rect['h']:.0f}px tall")
        for hidden in ("Invite link", "Hive members", "Share my location now"):
            visible = page.evaluate(f"""[...document.querySelectorAll('#view-trip *')].some(e => e.children.length === 0 && e.textContent.includes('{hidden}') && e.offsetParent !== null)""")
            check(not visible, f"'{hidden}' is not cluttering the map (it's under the menu)")
        legend = page.evaluate("(() => { const l = document.getElementById('live-legend').getBoundingClientRect(); const h = document.querySelector('header').getBoundingClientRect(); const b = document.getElementById('camera-bar').getBoundingClientRect(); return { top: l.top, bottom: l.bottom, headerBottom: h.bottom, barTop: b.top, chips: document.querySelectorAll('#live-legend .legend-chip').length }; })()")
        check(legend["chips"] == 3 and legend["top"] >= legend["headerBottom"] and legend["bottom"] < legend["barTop"], "who's-who legend is a strip along the top, clear of the camera buttons", f"{legend['chips']} members")
        page.screenshot(path=f"{SHOTS}/map_landing_far.png")

        print("DOTS: small along the map, pictures only when you zoom in")
        page.evaluate(f"liveMap.jumpTo({{ center: [{HOME[0] + 0.02}, {HOME[1] + 0.01}], zoom: 11 }})"); page.wait_for_timeout(500)
        dot = page.evaluate("(() => { const d = document.querySelector('.photo-pin-dot').getBoundingClientRect(); const i = getComputedStyle(document.querySelector('.photo-pin-img')).display; const b = getComputedStyle(document.querySelector('.photo-count-badge')).display; return { w: Math.round(d.width), img: i, badge: b, zoomed: liveMap.getContainer().classList.contains('map-zoomed-in') }; })()")
        check(dot["w"] <= 18 and dot["img"] == "none" and not dot["zoomed"], "zoomed out: tiny dots, no pictures", f"dot {dot['w']}px")
        col = page.evaluate("[...document.querySelectorAll('.photo-pin-dot')].slice(0,3).map(d => getComputedStyle(d).backgroundColor || d.style.background)")
        check(len(set(col)) == 3, "each person's dots have their own colour", str(col))
        multi = page.evaluate("[...document.querySelectorAll('.photo-pin-dot')].filter(d => d.style.background.includes('conic-gradient')).length")
        check(multi == 0, "(one person per spot in this test data, so no mixed-colour dots)")
        page.screenshot(path=f"{SHOTS}/map_dots_zoomed_out.png")
        errs = marker_errors(page); check(max(max(abs(e['dx']), abs(e['dy'])) for e in errs) <= 2, "every dot sits exactly on its spot", f"worst {max(max(abs(e['dx']), abs(e['dy'])) for e in errs)}px")

        page.evaluate(f"liveMap.jumpTo({{ center: [{spot(0)[0]}, {spot(0)[1]}], zoom: 16.5 }})"); page.wait_for_timeout(600)
        near = page.evaluate("(() => { const d = document.querySelector('.photo-pin-dot').getBoundingClientRect(); const i = getComputedStyle(document.querySelector('.photo-pin-img')).display; return { w: Math.round(d.width), img: i, zoomed: liveMap.getContainer().classList.contains('map-zoomed-in') }; })()")
        check(near["zoomed"] and near["img"] == "block" and near["w"] >= 44, "zoomed in close: the dot grows into a picture", f"{near['w']}px")
        page.screenshot(path=f"{SHOTS}/map_dots_zoomed_in.png")
        errs = marker_errors(page); check(max(max(abs(e['dx']), abs(e['dy'])) for e in errs) <= 2, "...and still sits exactly on its spot", f"worst {max(max(abs(e['dx']), abs(e['dy'])) for e in errs)}px")

        print("TAP A DOT: see who, then their pictures")
        page.evaluate(f"liveMap.jumpTo({{ center: [{HOME[0] + 0.02}, {HOME[1] + 0.01}], zoom: 11 }})"); page.wait_for_timeout(600)
        target = page.evaluate("(() => { const r = livePhotoMarkers[1].getElement().getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()")
        page.mouse.click(target["x"], target["y"]); page.wait_for_timeout(500)
        check(page.is_visible("#orbit"), "tapping a small dot with a real finger-sized tap opens the photo browser")
        who = page.evaluate("[...document.querySelectorAll('.orbit-user-label')].map(e => e.textContent)")
        check(len(who) >= 1 and any("Vasantha" in w or "Ravi" in w or "Sasi" in w for w in who), "it shows who took photos there", str(who))
        page.screenshot(path=f"{SHOTS}/map_dot_tapped.png")
        page.click("#orbit-close"); page.wait_for_timeout(300)

        print("MENU: everything else lives under the three lines")
        page.click("#menu-btn"); page.wait_for_timeout(500)
        txt = page.inner_text("#drawer")
        for must in ("DwarakaTripAll", "Hive members", "Invite link", "Trips / i'Hives", "Share my location now", "Account info", "Install the app", "Build:"):
            check(must in txt, f"menu has '{must}'")
        check(page.is_visible("#drawer-trip-card"), "the 'this trip' card is shown while you're on the live map")
        page.screenshot(path=f"{SHOTS}/map_menu.png")
        page.click("#drawer-overlay", position={"x": 340, "y": 400}); page.wait_for_timeout(300)
        print("JS errors:", errors); check(not errors, "no JavaScript errors")
        browser.close()

        # ---------------------------------------------------------------- no live trip
        browser, ctx = launch(p)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        install_routes(page, media, bubbles, trips=[{"id": "T0", "name": "Old trip", "status": "ended", "left": False}])
        page.goto(BASE + "/")
        page.wait_for_selector("#landing-card", state="visible", timeout=10000); page.wait_for_timeout(800)
        print("NO LIVE TRIP: still a map first")
        check(page.is_visible("#landing-map canvas"), "a real map is showing")
        check(page.is_visible("#landing-card") and "No live trip" in page.inner_text("#landing-card"), "with a small card on top")
        check(not page.is_visible("#view-home"), "not the hive list")
        page.screenshot(path=f"{SHOTS}/map_no_trip.png")
        page.click("#landing-card >> text=Start a trip"); page.wait_for_timeout(600)
        check(page.is_visible("#view-home"), "'Start a trip' leads to the hive list / create screen")
        check(not errors, "no JavaScript errors", str(errors))
        browser.close()

    passed = sum(results)
    print(f"\n{passed}/{len(results)} checks passed")
    sys.exit(0 if passed == len(results) else 1)
