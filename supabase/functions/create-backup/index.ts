import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { requireOwner } from "../_shared/owner.ts";

const tables = [
  "cities", "categories", "category_translations", "products", "product_translations",
  "product_prices", "product_media", "description_templates", "description_template_translations",
  "profiles", "user_cities", "user_product_permissions", "user_access_permissions",
  "access_requests", "access_request_cities", "access_history", "site_settings",
] as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { admin, profile } = await requireOwner(request.headers.get("Authorization") || "");
    const results = await Promise.all(tables.map(async (table) => {
      const result = await admin.from(table).select("*");
      if (result.error) throw result.error;
      return [table, result.data || []] as const;
    }));
    const tableData = Object.fromEntries(results);
    const createdAt = new Date().toISOString();
    const snapshot = { version: 1, createdAt, tables: tableData };
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const id = crypto.randomUUID();
    const fileName = `comercial-produtos-${createdAt.replace(/[:.]/g, "-")}.json`;
    const filePath = `${createdAt.slice(0, 10)}/${id}.json`;
    const upload = await admin.storage.from("backups").upload(filePath, bytes, { contentType: "application/json", upsert: false });
    if (upload.error) throw upload.error;
    const metadata = await admin.from("backups").insert({ id, file_path: filePath, categories_count: tableData.categories.length, products_count: tableData.products.length, users_count: tableData.profiles.length, created_by: profile.id }).select("*").single();
    if (metadata.error || !metadata.data) throw metadata.error || new Error("BACKUP_METADATA_FAILED");
    return jsonResponse({ backup: { id, createdAt, categoriesCount: tableData.categories.length, productsCount: tableData.products.length, usersCount: tableData.profiles.length, fileName, snapshot } });
  } catch (error) {
    console.error("create-backup failed", error);
    return jsonResponse({ error: error instanceof Error && error.message === "OWNER_REQUIRED" ? "OWNER_REQUIRED" : "BACKUP_FAILED" }, error instanceof Error && error.message === "OWNER_REQUIRED" ? 403 : 500);
  }
});
