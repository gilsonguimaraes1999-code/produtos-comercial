import { createAdminClient, normalizeUsername } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const body = await request.json() as { displayName?: string; username?: string; cityIds?: string[] };
    const admin = createAdminClient();
    const result = await admin.rpc("submit_access_request", {
      request_display_name: String(body.displayName || "").trim(),
      request_username: normalizeUsername(String(body.username || "")),
      requested_city_ids: Array.isArray(body.cityIds) ? body.cityIds : [],
    });
    if (result.error) {
      const known = ["DISPLAY_NAME_INVALID", "USERNAME_INVALID", "CITY_REQUIRED", "CITY_INVALID", "ACCOUNT_ALREADY_EXISTS", "ACCESS_REQUEST_PENDING"].find((code) => result.error?.message.includes(code));
      return jsonResponse({ error: known || "ACCESS_REQUEST_FAILED" }, known ? 400 : 500);
    }
    return jsonResponse({ requestId: result.data }, 201);
  } catch (error) {
    console.error("request-access failed", error);
    return jsonResponse({ error: "ACCESS_REQUEST_FAILED" }, 500);
  }
});
