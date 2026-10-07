# Tests

These run the REAL `public/index.html` in a simulated browser (jsdom) with a fake
Mapbox, fake camera, and fake server - and click real buttons. They exist because
several real bugs once shipped past type-checking and syntax checks.

## Run everything
```
cd tests && npm init -y >/dev/null && npm i jsdom     # one-time; deliberately NOT in the app's package.json
cd .. && npm run build                                  # backend tests use dist/
bash tests/run_all.sh
```

## Real-map check (REAL Mapbox engine, offline) - `tests/real_map_check.py`
The simulated-browser tests use a FAKE map that doesn't position anything, so they can't see layout bugs
(a CSS rule once pulled photo markers out of place by 46px each - invisible to them). This one runs the real
app in real Chromium with the real Mapbox GL engine (blank background, no tiles, no network) and checks where
markers actually land, how the dots look at different zoom levels, that tapping a small dot works, the
full-screen map landing page, the menu, and the no-live-trip landing. `run_all.sh` runs it automatically when
the tools below are installed (and prints SKIPPED otherwise).
```
mkdir -p /tmp/mb && cd /tmp/mb && npm init -y && npm i mapbox-gl@3.7.0
pip install playwright && playwright install chromium
```

## Rules that came from real bugs
- A new test for a bug must FAIL against the broken code first, then pass against the fix.
- jsdom can't judge CSS stacking/visibility or map positioning - use `real_map_check.py` for layout and marker placement.
- Inline `onclick="..."` attributes can break without any script error - tests must click the real button.
