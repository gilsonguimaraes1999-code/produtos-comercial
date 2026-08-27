import { createAdminClient, sha256Hex } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(length = 10): string {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => alphabet[value % alphabet.length]).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse({ error: "AUTH_REQUIRED" }, 401);

    const payload = (await request.json()) as { profileId?: string };
    if (!payload.profileId) return jsonResponse({ error: "PROFILE_REQUIRED" }, 400);

    const admin = createAdminClient();
    const userResult = await admin.auth.getUser(token);
    if (userResult.error || !userResult.data.user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    }

    const ownerResult = await admin
      .from("profiles")
      .select("id, role, status")
      .eq("auth_user_id", userResult.data.user.id)
      .single();
    if (
      ownerResult.error ||
      ownerResult.data?.role !== "owner" ||
      ownerResult.data?.status !== "active"
    ) {
      return jsonResponse({ error: "OWNER_REQUIRED" }, 403);
    }

    const targetResult = await admin
      .from("profiles")
      .select("id, status")
      .eq("id", payload.profileId)
      .single();
    if (targetResult.error || !targetResult.data) {
      return jsonResponse({ error: "PROFILE_NOT_FOUND" }, 404);
    }

    const code = generateCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await admin
      .from("activation_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("profile_id", payload.profileId)
      .is("consumed_at", null);

    const insertResult = await admin.from("activation_codes").insert({
      profile_id: payload.profileId,
      code_hash: codeHash,
      expires_at: expiresAt,
      created_by: ownerResult.data.id,
    });
    if (insertResult.error) throw insertResult.error;

    return jsonResponse({ code, expiresAt });
  } catch (error) {
    console.error("create-activation-code failed", error);
    return jsonResponse({ error: "ACTIVATION_CODE_CREATION_FAILED" }, 500);
  }
});
