import { createAdminClient } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { translateContent } from "../_shared/free-translate.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  const admin = createAdminClient();
  let jobId = "";
  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const authResult = await admin.auth.getUser(token);
    if (!token || authResult.error || !authResult.data.user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    }

    const body = await request.json() as { jobId?: string; retry?: boolean };
    jobId = body.jobId || "";
    if (!jobId) return jsonResponse({ error: "TRANSLATION_JOB_REQUIRED" }, 400);

    const jobResult = await admin
      .from("translation_jobs")
      .select("id, entity_type, entity_id, source_language, target_language, status, attempt_count")
      .eq("id", jobId)
      .single();
    if (jobResult.error || !jobResult.data) return jsonResponse({ error: "TRANSLATION_JOB_NOT_FOUND" }, 404);
    const job = jobResult.data;
    if (job.status === "completed") return jsonResponse({ ok: true, alreadyCompleted: true });
    if (job.status === "running") return jsonResponse({ error: "TRANSLATION_JOB_RUNNING" }, 409);

    const claim = await admin
      .from("translation_jobs")
      .update({ status: "running", attempt_count: job.attempt_count + 1, last_error: null })
      .eq("id", job.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claim.error || !claim.data) return jsonResponse({ error: "TRANSLATION_JOB_RUNNING" }, 409);

    if (job.entity_type === "product") {
      const source = await admin
        .from("product_translations")
        .select("name, description_html")
        .eq("product_id", job.entity_id)
        .eq("language", job.source_language)
        .single();
      if (source.error || !source.data) throw new Error("TRANSLATION_SOURCE_NOT_FOUND");
      const [name, description] = await Promise.all([
        translateContent({
          text: source.data.name,
          sourceLanguage: job.source_language,
          targetLanguage: job.target_language,
          mimeType: "text/plain",
        }),
        translateContent({
          text: source.data.description_html || "",
          sourceLanguage: job.source_language,
          targetLanguage: job.target_language,
          mimeType: "text/html",
        }),
      ]);
      const save = await admin.from("product_translations").upsert({
        product_id: job.entity_id,
        language: job.target_language,
        name,
        description_html: description,
        is_source: false,
        translation_status: "translated",
      });
      if (save.error) throw save.error;
    } else if (job.entity_type === "category") {
      const source = await admin
        .from("category_translations")
        .select("title")
        .eq("category_id", job.entity_id)
        .eq("language", job.source_language)
        .single();
      if (source.error || !source.data) throw new Error("TRANSLATION_SOURCE_NOT_FOUND");
      const title = await translateContent({
        text: source.data.title,
        sourceLanguage: job.source_language,
        targetLanguage: job.target_language,
        mimeType: "text/plain",
      });
      const save = await admin.from("category_translations").upsert({
        category_id: job.entity_id,
        language: job.target_language,
        title,
        is_source: false,
      });
      if (save.error) throw save.error;
    } else {
      throw new Error("TRANSLATION_ENTITY_UNSUPPORTED");
    }

    await admin.from("translation_jobs").update({ status: "completed", last_error: null }).eq("id", job.id);
    return jsonResponse({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRANSLATION_FAILED";
    console.error("process-translation failed", { jobId, message });
    if (jobId) {
      await admin.from("translation_jobs").update({ status: "failed", last_error: message.slice(0, 500) }).eq("id", jobId);
    }
    return jsonResponse({ error: "TRANSLATION_FAILED" }, 500);
  }
});
