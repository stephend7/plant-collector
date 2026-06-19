// ── Supabase connection — Plant Collector DB ─────────────────────────────────
// These two values are SAFE to be public: the publishable key does nothing on
// its own — it only ever works through the owner-only RLS rules in schema.sql.
// NEVER put the `sb_secret_…` / service_role key or the database password here.
const SUPABASE_URL = "https://levevlvmdtieddzhkcdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_tM5HHFQkie-SlaY83iHRUA_XHid_B8s";
