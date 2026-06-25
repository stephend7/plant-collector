import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    // Verify the caller is a signed-in user
    const auth = req.headers.get("Authorization");
    if (!auth) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: { user }, error: authErr } = await supa.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });
    }

    // Parse the request body
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Missing imageBase64" }), { status: 400, headers: cors });
    }
    // Untrusted input: a direct API call bypasses the browser's resize, so the
    // server enforces its own limits (Security review C4 + C10).
    const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!ALLOWED_MIME.has(mimeType)) {
      return new Response(JSON.stringify({ error: "Unsupported media type" }), { status: 400, headers: cors });
    }
    if (typeof imageBase64 !== "string" || imageBase64.length > 2_000_000) {
      // ~2M base64 chars ≈ 1.5 MB binary — well above a 1600px JPEG, well below abuse.
      return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413, headers: cors });
    }

    // NOTE (Security review C9): no per-user rate limit. Accepted risk for the
    // solo MVP — add a per-user call counter before opening this to other users.
    // Call Claude to read the tag
    const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: imageBase64 },
          },
          {
            type: "text",
            text: `Read this plant tag or label and return ONLY a JSON object. No explanation, no markdown fences.

{
  "genus": "Genus name, first letter capitalized (e.g. Pinguicula). null if not visible.",
  "species": "The full plant name after the genus, VERBATIM: species epithet, hybrid × markers, cultivar 'names in quotes', sp./ssp./var./f. ranks, AND any cross or clone number that is part of the written name. Keep a trailing #N when it belongs to the name — e.g. for 'P. laueana × Unknown #3' return 'laueana × Unknown #3' (the #3 identifies the cross and stays here). Lowercase except cultivar names and proper nouns. null if not visible.",
  "form": "Additional clone or form designator not already in species. null if none.",
  "price": "Numeric price only, no $ sign (e.g. 15 or 3.50). null if not visible.",
  "vendor": "Seller or vendor name if printed on the tag. null if not visible.",
  "accession": "A vendor's SEPARATE stock/accession code, printed apart from the plant name (e.g. BE-3390). Do NOT take a number that is part of the plant name (like the #3 in '× Unknown #3'). Ignore simple internal codes like #A3 or #B2. null if none.",
  "locality": "Wild origin data in parentheses or braces if present, e.g. Warby Range, Victoria, Australia. null if none.",
  "careNotes": "Brief care instructions if written on the tag. Do NOT put any part of the plant name here. null if none."
}

Rules:
- Return ONLY the JSON — no text before or after.
- genus: capitalize first letter only (Pinguicula, not PINGUICULA or pinguicula).
- species: preserve × for hybrids and single quotes around cultivar names, and keep the WHOLE name remainder including a trailing cross/clone #N (e.g. '× Unknown #3').
- A trailing #N that is part of a hybrid/cross name stays in "species"; it is NOT a care note or an accession code.
- Ignore simple vendor-internal codes like #A3 (a code separate from the name) — put one in "accession" only if it is a meaningful clone ID.
- If the image is blurry or a field is unclear, use null for that field.`,
          },
        ],
      }],
    });

    // Parse Claude's response as JSON
    const text = msg.content[0].type === "text" ? msg.content[0].text.trim() : "{}";
    let result: Record<string, unknown>;
    try {
      result = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      result = m ? JSON.parse(m[0]) : {};
    }

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    // Log the real error server-side; return a generic message so internal
    // details (Anthropic request IDs, quota, endpoints) don't leak (Security review C11).
    console.error("scan-tag error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
