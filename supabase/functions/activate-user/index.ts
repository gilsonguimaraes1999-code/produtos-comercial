import { createAdminClient, normalizeUsername, sha256Hex } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

interface ActivationPayload {
  username?: string;
  code?: string;
  password?: string;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const payload = (await request.json()) as ActivationPayload;
    const username = normalizeUsername(payload.username || "");
    const code = (payload.code || "").trim().toUpperCase();
    const password = payload.password || "";

    if (!username || /\s/.test(username)) return jsonResponse({ error: "USERNAME_INVALID" }, 400);
    if (!/^[A-Z0-9]{10}$/.test(code)) return jsonResponse({ error: "ACTIVATION_CODE_INVALID" }, 400);
    if (password.length < 8) return jsonResponse({ error: "PASSWORD_TOO_SHORT" }, 400);

    const admin = createAdminClient();
    const profileResult = await admin
      .from("profiles")
      .select("id, auth_user_id, status")
      .eq("username_normalized", username)
      .single();

    if (profileResult.error || !profileResult.data?.auth_user_id) {
      return jsonResponse({ error: "ACTIVATION_NOT_AVAILABLE" }, 404);
    }
    if (profileResult.data.status === "active") {
      return jsonResponse({ error: "ACCOUNT_ALREADY_ACTIVE" }, 409);
    }

    const activationResult = await admin
      .from("activation_codes")
      .select("id, code_hash, expires_at, attempt_count, max_attempts")
      .eq("profile_id", profileResult.data.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const activation = activationResult.data;
    if (!activation || new Date(activation.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ error: "ACTIVATION_CODE_EXPIRED" }, 410);
    }
    if (activation.attempt_count >= activation.max_attempts) {
      return jsonResponse({ error: "ACTIVATION_ATTEMPTS_EXCEEDED" }, 429);
    }

    const providedHash = await sha256Hex(code);
    if (providedHash !== activation.code_hash) {
      await admin
        .from("activation_codes")
        .update({ attempt_count: activation.attempt_count + 1 })
        .eq("id", activation.id)
        .is("consumed_at", null);
      return jsonResponse({ error: "ACTIVATION_CODE_INVALID" }, 401);
    }

    const authUpdate = await admin.auth.admin.updateUserById(
      profileResult.data.auth_user_id,
      { password },
    );
    if (authUpdate.error) throw authUpdate.error;

    const consumedAt = new Date().toISOString();
    const [consumeResult, profileUpdate] = await Promise.all([
      admin
        .from("activation_codes")
        .update({ consumed_at: consumedAt })
        .eq("id", activation.id)
        .is("consumed_at", null),
      admin
        .from("profiles")
        .update({ status: "active" })
        .eq("id", profileResult.data.id),
    ]);
    if (consumeResult.error || profileUpdate.error) {
      throw consumeResult.error || profileUpdate.error;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error("activate-user failed", error);
    return jsonResponse({ error: "ACTIVATION_FAILED" }, 500);
  }
});
