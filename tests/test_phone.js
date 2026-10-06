// Phone-number identity: the same person must always get the same account,
// including accounts saved BEFORE numbers were normalized.
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_dummy";
process.env.MAPBOX_TOKEN = "pk.test";
const path = require("path"), assert = require("assert");
const { supabase } = require(path.resolve(__dirname, "../dist/db/supabaseClient.js"));
const { UserService, normalizePhone } = require(path.resolve(__dirname, "../dist/services/UserService.js"));
let n = 0; const ok = (c, m) => { assert(c, "FAIL: " + m); n++; console.log("  ✓", m); };

// A tiny in-memory stand-in for the database (just the operations UserService uses).
function fakeDb(users, pack_members = [], opts = {}) {
  const db = { users: users.map(u => ({ ...u })), pack_members, log: [] };
  supabase.from = table => {
    const q = { table, filters: [], op: "select", payload: null };
    const rows = () => db[table].filter(r => q.filters.every(f => f(r)));
    const run = () => {
      if (q.op === "insert") { const row = { id: "new-" + (db.users.length + 1), created_at: "2026-10-04", ...q.payload }; db.users.push(row); db.log.push("insert " + row.phone_number); return [row]; }
      if (q.op === "update") {
        db.log.push("update " + JSON.stringify(q.payload));
        if (opts.updateFails) return { error: { message: "unique violation" } };
        rows().forEach(r => Object.assign(r, q.payload)); return rows();
      }
      db.log.push("select " + table);
      return rows();
    };
    const b = {
      select() { return b; }, insert(p) { q.op = "insert"; q.payload = p; return b; }, update(p) { q.op = "update"; q.payload = p; return b; },
      eq(col, v) { q.filters.push(r => r[col] === v); return b; }, in(col, vs) { q.filters.push(r => vs.includes(r[col])); return b; },
      single() { const r = run(); if (r.error) return Promise.resolve(r); return Promise.resolve(r.length ? { data: r[0], error: null } : { data: null, error: { message: "none" } }); },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r[0] || null, error: null }); },
      then(res, rej) { const r = run(); return Promise.resolve(r.error ? r : { data: r, error: null }).then(res, rej); },
    };
    return b;
  };
  return db;
}
const svc = new UserService();
const U = (id, phone, extra = {}) => ({ id, phone_number: phone, display_name: "x", created_at: "2026-09-01", ...extra });

(async () => {
  console.log("An account saved in the format the sign-up box suggests (+1...)");
  let db = fakeDb([U("sasi", "+15551234567", { display_name: "Sasi" })]);
  let u = await svc.findOrCreateByPhone({ phoneNumber: "(555) 123-4567", displayName: "Sasi" });
  ok(u.id === "sasi", "found by typing the number with brackets and dashes");
  ok(!db.log.some(l => l.startsWith("insert")), "no second, empty account was created");
  ok(db.users.length === 1, "still exactly one account");
  ok(db.users[0].phone_number === "5551234567", "stored in the normalized form from now on");

  console.log("Same account, found again every other way people type it");
  for (const typed of ["5551234567", "+1 555 123 4567", "+15551234567", "1-555-123-4567".replace("1-", "+1-"), "555.123.4567"]) {
    db = fakeDb([U("sasi", "+15551234567", { display_name: "Sasi" })]);
    u = await svc.findOrCreateByPhone({ phoneNumber: typed, displayName: "Sasi" });
    ok(u.id === "sasi" && db.users.length === 1, `"${typed}" -> same account`);
  }

  console.log("Accounts saved other ways");
  db = fakeDb([U("a", "555-123-4567")]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "+1 555 123 4567", displayName: "x" });
  ok(u.id === "a", "stored with dashes, typed with +1");
  db = fakeDb([U("c", "+919876543210")]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "+91 98765 43210", displayName: "x" });
  ok(u.id === "c", "non-US number with spaces still matches");

  console.log("Different people never collide");
  db = fakeDb([U("a", "+15551234567")]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "5551234568", displayName: "Other" });
  ok(u.id !== "a" && db.users.length === 2, "one digit different = a different person");
  ok(db.users[1].phone_number === "5551234568", "new accounts are saved normalized");

  console.log("Fast path");
  db = fakeDb([U("a", "5551234567"), U("b", "5559999999")]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "+1 (555) 123-4567", displayName: "x" });
  ok(u.id === "a", "already-normalized account is found");
  ok(db.log.filter(l => l === "select users").length === 1, "...with exactly ONE lookup (no scan of every user)");

  console.log("The same person already has two accounts (from the old bug)");
  db = fakeDb([U("old-empty", "+15551234567", { created_at: "2026-09-01" }), U("real", "555-123-4567", { created_at: "2026-09-10" })],
              [{ user_id: "real" }, { user_id: "real" }, { user_id: "real" }]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "5551234567", displayName: "x" });
  ok(u.id === "real", "picks the account that actually belongs to hives, not the empty one");
  db = fakeDb([U("first", "+15551234567", { created_at: "2026-09-01" }), U("second", "555-123-4567", { created_at: "2026-09-10" })]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "5551234567", displayName: "x" });
  ok(u.id === "first", "with no hives either way, keeps the oldest");

  console.log("A name typed at sign-up replaces an invite placeholder");
  db = fakeDb([U("p", "+15551234567", { display_name: "Pending member" })]);
  u = await svc.findOrCreateByPhone({ phoneNumber: "5551234567", displayName: "Susha" });
  ok(u.id === "p" && u.display_name === "Susha", "placeholder became Susha, same account");

  console.log("If tidying the stored number fails, you still get the right account");
  db = fakeDb([U("a", "+15551234567")], [], { updateFails: true });
  u = await svc.findOrCreateByPhone({ phoneNumber: "5551234567", displayName: "x" });
  ok(u.id === "a", "returned correctly despite the update error");

  console.log("CONTROL: the previous logic (normalize, then exact match only) must FAIL these");
  db = fakeDb([U("sasi", "+15551234567", { display_name: "Sasi" })]);
  const real = UserService.prototype.findByPhone;
  UserService.prototype.findByPhone = async function (normalized) {
    const { data } = await supabase.from("users").select("*").eq("phone_number", normalized).maybeSingle(); return data;
  };
  u = await svc.findOrCreateByPhone({ phoneNumber: "(555) 123-4567", displayName: "Sasi" });
  UserService.prototype.findByPhone = real;
  ok(u.id !== "sasi" && db.users.length === 2, "old logic created a SECOND account - this is the bug the fix prevents");

  console.log(`\nALL ${n} PHONE-IDENTITY CHECKS PASSED`);
})().catch(e => { console.error("\n" + e.message); process.exit(1); });
