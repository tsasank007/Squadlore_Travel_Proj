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

## Real-browser check (optional, needs `pip install playwright && playwright install chromium`)
`tests/real_browser.py` drives the real app in real Chromium with a fake camera device
and takes screenshots (camera screen, trip screen, menu). Start a static server first:
`python3 -m http.server 4097 --directory public &` then `python3 tests/real_browser.py`.

## Rules that came from real bugs
- A new test for a bug must FAIL against the broken code first, then pass against the fix.
- jsdom can't judge CSS stacking/visibility reliably - use the real-browser script for layout.
- Inline `onclick="..."` attributes can break without any script error - tests must click the real button.
