---
type: plan
title: Tag Scanner — Architect Contract & Conditions for Builder
description: Full-tier design contract for the Claude-Vision plant-tag scanner (Edge Function + client). The security/correctness invariants the Security pass reviews against.
updated: 2026-06-22
---

# Tag Scanner — Architect Contract

> **Tier: FULL.** Triggers: network egress, secret handling, auth, untrusted file
> input, and no analog already shipped (first Edge Function in the project).
> **Honesty note:** the implementation was written before this contract (Builder ran
> ahead of Architect/Security). This doc captures the intended design and, critically,
> the **Conditions for Builder** that the separated Security pass now reviews against.

## Summary

Let the user photograph a physical plant tag and have Claude's vision model read it,
returning structured fields that **pre-fill** the add-plant form for the user to
confirm/correct. No field is auto-saved; the user always reviews before Save.

This mirrors the already-shipped `applyDetection` flow (filename/EXIF auto-fill), but
the text now comes from the **pixels of a photographed tag** read server-side by Claude
— which is why it needs a backend (the API key cannot live in the browser).

## Data flow

```
[Add form] —pick/take photo—> client: resizeImage→JPEG (HEIC handled) → base64
   → POST {imageBase64, mimeType} + Bearer <supabase access_token>
   → Edge Function `scan-tag`:
        1. verify caller's JWT (reject anonymous)
        2. call Anthropic vision (ANTHROPIC_API_KEY from Deno.env)
        3. parse model output as JSON
        4. return {genus,species,form,price,vendor,accession,locality,careNotes}
   → client applyTagScan(): look-up-or-create genus/species/vendor (RLS-scoped),
        confirm-don't-clobber into the form, show "Filled from tag" note.
```

## Files

**Created**
- `supabase/functions/scan-tag/index.ts` — the Edge Function. Deno.serve handler;
  Anthropic SDK (`npm:@anthropic-ai/sdk`, model `claude-sonnet-4-6` — chosen for accuracy on hard
  tags); supabase-js for `auth.getUser`.

**Modified — `app/index.html`** (mirrors the existing `applyDetection`/`onPhotoFiles` pattern)
- add-form: a `🏷 Scan Tag` button + hidden `scanInput` file picker (add mode only)
- state: `scanBusy` flag (disables Add Photo / Scan / Save while a scan runs)
- methods: `onScanFile`, `scanTag(file)`, `applyTagScan(result)`
- `app-build` bumped `2026-06-22l → m`

## Conditions for Builder (security/correctness invariants — the Security checklist)

1. **C1 — Secret never leaves the server.** `ANTHROPIC_API_KEY` is read only via
   `Deno.env` in the Edge Function. It must never appear in the client, `config.js`,
   the repo, or any response body. (This is Stephen's #1 durability/safety concern.)
2. **C2 — Reject anonymous callers before spending.** The function must require a
   valid Supabase JWT (`Authorization: Bearer`) and 401 before calling Anthropic —
   both an access control AND a cost control.
3. **C3 — No cross-tenant access via the service role.** If the service-role key is
   used (it bypasses RLS), it must be used **only** to verify the token
   (`auth.getUser`), never to read or write user rows.
4. **C4 — Supported media types only.** Anthropic accepts jpeg/png/webp/gif, not HEIC.
   The client must convert (resizeImage → JPEG, heic2any fallback) before sending.
5. **C5 — AI output is untrusted; confirm-don't-clobber.** Scanned fields pre-fill the
   form only where the user hasn't already entered a value, and nothing is saved until
   the user taps Save. No auto-commit of a plant from a scan.
6. **C6 — Sanitize numerics.** `price` is stripped to digits/decimal before use.
7. **C7 — Inserts ride existing RLS.** genus/species/vendor creation uses the existing
   supabase-js insert path (parameterized, RLS-scoped to the user). No raw SQL, no
   service key on the client.
8. **C8 — Fail safe, not stuck.** Any scan error surfaces as a message and resets
   `scanBusy` (finally), never leaving the form wedged.
9. **C9 — Abuse / cost exposure (REVIEW).** No rate limiting or per-user cap exists.
   An authenticated user could spam the endpoint and run up Anthropic cost. Flag
   severity + recommend a mitigation (or an accepted-risk note for the solo MVP).
10. **C10 — Bounded payload (REVIEW).** The server does not cap image size; it trusts
    the client's resize. Flag whether a server-side size guard is warranted.
11. **C11 — Error verbosity (REVIEW).** The 500 path returns `err.message`; check for
    internal-detail leakage and recommend a generic message + server-side log.
12. **C12 — CORS.** `Access-Control-Allow-Origin: *` — assess against the JWT
    requirement; recommend tightening to the app origin if warranted.

## Testing notes

- Browser preview sandbox cannot start here (known `getcwd` limitation) and the
  function is not yet deployed, so end-to-end is **gated on deploy + on-device**.
- What CAN be verified now: static/syntax checks, brace balance, that the secret is
  absent from client/repo, and that the client path mirrors the shipped pattern.
- Real-world test corpus exists: the 13 + 5 tag photos in `tag-scanning-findings`
  (easy printed → hard purple-grow-light) for once the function is live.
