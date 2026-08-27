import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOwner } from "../_shared/owner.ts";

const catalogTables = [
  "cities", "categories", "category_translations", "products", "product_translations",
  "product_prices", "product_media", "description_templates", "description_template_translations", "site_settings",
] as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { admin, profile } = await requireOwner(request.headers.get("Authorization") || "");
    const body = await request.json() as { snapshot?: { version?: number; tables?: Record<string, unknown[]> } };
    if (body.snapshot?.version !== 1 || !body.snapshot.tables) return jsonResponse({ error: "BACKUP_INVALID" }, 400);
    const counts: Record<string, number> = {};
    for (const table of catalogTables) {
      const rows = body.snapshot.tables[table] || [];
      if (!Array.isArray(rows) || !rows.length) { counts[table] = 0; continue; }
      const result = await admin.from(table).upsert(rows);
      if (result.error) throw new Error(`${table}:${result.error.message}`);
      counts[table] = rows.length;
    }
    await admin.from("audit_events").insert({ actor_profile_id: profile.id, action: "import_backup", entity_type: "backup", metadata: { counts } });
    return jsonResponse({ imported: true, counts });
  } catch (error) {
    console.error("import-backup failed", error);
    return jsonResponse({ error: "BACKUP_IMPORT_FAILED" }, 500);
  }
});
