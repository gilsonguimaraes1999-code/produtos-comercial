import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOwner } from "../_shared/owner.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { admin } = await requireOwner(request.headers.get("Authorization") || "");
    const rows = await admin.from("backups").select("id, file_path, categories_count, products_count, users_count, created_at").order("created_at", { ascending: false }).limit(20);
    if (rows.error) throw rows.error;
    const backups = await Promise.all((rows.data || []).map(async (row) => {
      const file = await admin.storage.from("backups").download(row.file_path);
      if (file.error) throw file.error;
      const snapshot = JSON.parse(await file.data.text());
      return { id: row.id, createdAt: row.created_at, fileName: `comercial-produtos-${row.created_at.replace(/[:.]/g, "-")}.json`, snapshot };
    }));
    return jsonResponse({ backups });
  } catch (error) {
    console.error("list-backups failed", error);
    return jsonResponse({ error: "BACKUP_LIST_FAILED" }, 500);
  }
});
