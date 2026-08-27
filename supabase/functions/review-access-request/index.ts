import { createAdminClient, createUserClient, issueActivationCode, randomSecret, technicalEmailForUsername } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  let createdAuthUserId: string | null = null;
  try {
    const authorization = request.headers.get("Authorization") || "";
    const admin = createAdminClient();
    const token = authorization.replace(/^Bearer\s+/i, "");
    const actor = await admin.auth.getUser(token);
    if (actor.error || !actor.data.user) return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    const body = await request.json() as { requestId?: string; decision?: "approved" | "rejected"; cityIds?: string[]; reason?: string };
    if (!body.requestId || !body.decision) return jsonResponse({ error: "REVIEW_DATA_REQUIRED" }, 400);
    let authUserId: string | null = null;
    if (body.decision === "approved") {
      const requestRow = await admin.from("access_requests").select("username").eq("id", body.requestId).eq("status", "pending").single();
      if (requestRow.error || !requestRow.data) return jsonResponse({ error: "REQUEST_NOT_PENDING" }, 409);
      const authResult = await admin.auth.admin.createUser({ email: technicalEmailForUsername(requestRow.data.username), password: randomSecret(), email_confirm: true });
      if (authResult.error || !authResult.data.user) return jsonResponse({ error: "AUTH_USER_CREATION_FAILED" }, 409);
      authUserId = authResult.data.user.id;
      createdAuthUserId = authUserId;
    }
    const userClient = createUserClient(authorization);
    const reviewed = await userClient.rpc("review_access_request", {
      target_request_id: body.requestId,
      decision: body.decision,
      approved_city_ids: body.decision === "approved" ? (body.cityIds || []) : [],
      new_auth_user_id: authUserId,
    });
    if (reviewed.error) throw reviewed.error;
    let activation = null;
    if (body.decision === "approved" && reviewed.data) {
      const reviewer = await admin.from("profiles").select("id").eq("auth_user_id", actor.data.user.id).single();
      activation = await issueActivationCode(admin, reviewed.data, reviewer.data?.id || null);
    }
    return jsonResponse({ ok: true, profileId: reviewed.data || null, activation });
  } catch (error) {
    if (createdAuthUserId) {
      try { await createAdminClient().auth.admin.deleteUser(createdAuthUserId); } catch { /* compensação de melhor esforço */ }
    }
    console.error("review-access-request failed", error);
    const message = error instanceof Error ? error.message : "";
    const known = ["REQUEST_PERMISSION_DENIED", "REQUEST_NOT_PENDING", "CITY_NOT_REQUESTED", "APPROVAL_DATA_REQUIRED"].find((code) => message.includes(code));
    return jsonResponse({ error: known || "ACCESS_REQUEST_REVIEW_FAILED" }, known === "REQUEST_PERMISSION_DENIED" ? 403 : 400);
  }
});
