// ── Supabase connection — Plant Collector DB ─────────────────────────────────
// These two values are SAFE to be public: the publishable key does nothing on
// its own — it only ever works through the owner-only RLS rules in schema.sql.
// NEVER put the `sb_secret_…` / service_role key or the database password here.
const SUPABASE_URL = "https://levevlvmdtieddzhkcdy.supabase.co";
const SUPABASE_KEY = "sb_publishable_tM5HHFQkie-SlaY83iHRUA_XHid_B8s";

// ── Google Sheets connect (sync step B) — docs/sheets-sync-plan.md ───────────
// All three values are PUBLIC BY DESIGN (they ship in every browser that loads
// this page; a public OAuth client has no secret). What keeps them safe:
//  - the client ID only works from the authorized origin (stephend7.github.io),
//  - the scope is drive.file (only files the USER picks via the Google Picker),
//  - the API key is referrer-restricted + Picker-API-only in the Google console.
// NEVER put a client SECRET, service-account key, or refresh token here.
// Values from Stephen's Google Cloud project "Plant Collector" (created 2026-07-07).
const GOOGLE_CLIENT_ID = "84016352164-bufo6bkls6q63gspkbiere1g5f9f4ct7.apps.googleusercontent.com";
const GOOGLE_API_KEY   = "AIzaSyCCJ8CSxAZlkXAlvFU7kxkpcSK0ALFnFcU";
const GOOGLE_APP_ID    = "84016352164";   // the numeric project number (Picker appId)
