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
  "species": "Everything after the genus: species epithet, hybrid × markers, cultivar 'names in quotes', sp./ssp./var./f., etc. Lowercase except cultivar names. null if not visible.",
  "form": "Additional clone or form designator not already in species. null if none.",
  "price": "Numeric price only, no $ sign (e.g. 15 or 3.50). null if not visible.",
  "vendor": "Seller or vendor name if printed on the tag. null if not visible.",
  "accession": "Vendor accession or clone ID number. Ignore simple internal codes like #A3 or #B2. null if none.",
  "locality": "Wild origin data in parentheses if present, e.g. Warby Range, Victoria, Australia. null if none.",
  "careNotes": "Brief care instructions if written on the tag. null if none."
}

Rules:
- Return ONLY the JSON — no text before or after.
- genus: capitalize first letter only (Pinguicula, not PINGUICULA or pinguicula).
- species: preserve × for hybrids and single quotes around cultivar names.
- Ignore simple vendor-internal codes like #A3 — those go in accession only if they are meaningful clone IDs.
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
