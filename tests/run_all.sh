#!/usr/bin/env bash
# Runs every test; exits non-zero if any fail.
cd "$(dirname "$0")/.."
HTML=public/index.html
fail=0
for t in test_orbit test_live test_video test_panfreeze test_retry test_camerabtn test_planroute test_endtrip test_delete test_camera test_install test_avatar; do
  printf "%-18s" "$t"; out=$(node tests/$t.js "$PWD/$HTML" 2>&1); code=$?
  echo "$out" | grep -E "PASSED|OK$|BROKEN|FAIL" | tail -1; [ $code -ne 0 ] && fail=1
done
for t in test_route test_outlier test_phone test_trips test_leave_routes; do
  printf "%-18s" "$t"; out=$(SUPABASE_URL=https://x.supabase.co SUPABASE_SERVICE_ROLE_KEY=sb_secret_x MAPBOX_TOKEN=pk.x node tests/$t.js 2>&1); code=$?
  echo "$out" | tail -1; [ $code -ne 0 ] && fail=1
done
exit $fail
