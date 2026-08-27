import { createAdminClient } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { translateContent } from "../_shared/free-translate.ts";

const languages = ["pt", "en", "es"] as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const admin = createAdminClient();
    const auth = await admin.auth.getUser(token);
    if (auth.error || !auth.data.user) return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    const body = await request.json() as { productId?: string; sourceLanguage?: "pt" | "en" | "es"; targetLanguage?: "pt" | "en" | "es" };
    if (!body.productId) return jsonResponse({ error: "PRODUCT_REQUIRED" }, 400);
    const [profileResult, productResult] = await Promise.all([
      admin.from("profiles").select("id, role, status, user_cities(city_id), user_product_permissions(create_product, edit_product_name, edit_product_description)").eq("auth_user_id", auth.data.user.id).single(),
      admin.from("products").select("id, categories(city_id), product_translations(language, name, description_html, is_source)").eq("id", body.productId).single(),
    ]);
    if (profileResult.error || !profileResult.data || profileResult.data.status !== "active") return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    if (productResult.error || !productResult.data) return jsonResponse({ error: "PRODUCT_NOT_FOUND" }, 404);
    const cityId = (productResult.data.categories as unknown as { city_id: string })?.city_id;
    const permission = Array.isArray(profileResult.data.user_product_permissions) ? profileResult.data.user_product_permissions[0] : profileResult.data.user_product_permissions;
    const allowedCity = profileResult.data.role === "owner" || (profileResult.data.user_cities || []).some((item: { city_id: string }) => item.city_id === cityId);
    const allowedAction = profileResult.data.role === "owner" || permission?.create_product || permission?.edit_product_name || permission?.edit_product_description;
    if (!allowedCity || !allowedAction) return jsonResponse({ error: "TRANSLATION_PERMISSION_REQUIRED" }, 403);
    const rows = (productResult.data.product_translations || []) as Array<{ language: "pt" | "en" | "es"; name: string; description_html: string; is_source: boolean }>;
    const source = rows.find((item) => item.language === body.sourceLanguage) || rows.find((item) => item.is_source) || rows[0];
    if (!source) return jsonResponse({ error: "TRANSLATION_SOURCE_NOT_FOUND" }, 404);
    const targets = body.targetLanguage ? [body.targetLanguage] : languages.filter((language) => language !== source.language);
    for (const target of targets) {
      if (target === source.language) continue;
      const job = await admin.from("translation_jobs").insert({ idempotency_key: `manual:${body.productId}:${target}:${crypto.randomUUID()}`, entity_type: "product", entity_id: body.productId, source_language: source.language, target_language: target, status: "running", attempt_count: 1 }).select("id").single();
      if (job.error || !job.data) throw job.error || new Error("TRANSLATION_JOB_FAILED");
      try {
        const [name, description] = await Promise.all([
          translateContent({ text: source.name, sourceLanguage: source.language, targetLanguage: target, mimeType: "text/plain" }),
          translateContent({ text: source.description_html || "", sourceLanguage: source.language, targetLanguage: target, mimeType: "text/html" }),
        ]);
        const saved = await admin.from("product_translations").upsert({ product_id: body.productId, language: target, name, description_html: description, is_source: false, translation_status: "translated" });
        if (saved.error) throw saved.error;
        await admin.from("translation_jobs").update({ status: "completed", last_error: null }).eq("id", job.data.id);
      } catch (error) {
        await admin.from("translation_jobs").update({ status: "failed", last_error: error instanceof Error ? error.message.slice(0, 500) : "TRANSLATION_FAILED" }).eq("id", job.data.id);
        throw error;
      }
    }
    return jsonResponse({ ok: true, translatedLanguages: targets });
  } catch (error) {
    console.error("translate-product failed", error);
    return jsonResponse({ error: "TRANSLATION_FAILED" }, 500);
  }
});
