import { createAdminClient, normalizeUsername, technicalEmailForUsername } from "../_shared/admin.ts";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type UserInput = {
  id?: string; name?: string; username?: string; role?: "OWNER" | "COMERCIAL";
  password?: string;
  active?: boolean; allowedCityIds?: string[];
  permissions?: { product?: Record<string, boolean>; accessRequests?: { manageAssignedCities?: boolean } };
};

const permissionMap: Record<string, string> = {
  createProduct: "create_product", editProductCategory: "edit_product_category",
  editProductName: "edit_product_name", editProductPrice: "edit_product_price",
  editProductDescription: "edit_product_description", editProductMedia: "edit_product_media",
  markProductSold: "mark_product_sold", viewSoldDiscordId: "view_owner_discord_id",
  cloneProduct: "clone_product", cloneCategory: "clone_category",
  deleteProduct: "delete_product", moveProduct: "move_product",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  let createdAuthUserId: string | null = null;
  try {
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    const admin = createAdminClient();
    const auth = await admin.auth.getUser(token);
    if (auth.error || !auth.data.user) return jsonResponse({ error: "AUTH_REQUIRED" }, 401);
    const actor = await admin.from("profiles").select("id, role, status").eq("auth_user_id", auth.data.user.id).single();
    if (actor.error || actor.data?.role !== "owner" || actor.data.status !== "active") return jsonResponse({ error: "OWNER_REQUIRED" }, 403);
    const body = await request.json() as { action?: "save" | "delete"; profileId?: string; user?: UserInput };
    if (body.action === "delete") {
      if (!body.profileId || body.profileId === actor.data.id) return jsonResponse({ error: "USER_DELETE_FORBIDDEN" }, 400);
      const target = await admin.from("profiles").select("auth_user_id, role").eq("id", body.profileId).single();
      if (target.error || !target.data) return jsonResponse({ error: "USER_NOT_FOUND" }, 404);
      if (target.data.role === "owner") return jsonResponse({ error: "OWNER_DELETE_FORBIDDEN" }, 403);
      const deleted = await admin.from("profiles").delete().eq("id", body.profileId);
      if (deleted.error) throw deleted.error;
      if (target.data.auth_user_id) await admin.auth.admin.deleteUser(target.data.auth_user_id);
      return jsonResponse({ ok: true });
    }
    if (body.action !== "save" || !body.user) return jsonResponse({ error: "USER_DATA_REQUIRED" }, 400);
    const user = body.user;
    const username = normalizeUsername(String(user.username || ""));
    const displayName = String(user.name || "").trim();
    const requestedPassword = String(user.password || "");
    if (!/^[a-z0-9._-]{2,64}$/.test(username) || displayName.length < 2) return jsonResponse({ error: "USER_DATA_INVALID" }, 400);
    if (requestedPassword && requestedPassword.length < 8) throw new Error("PASSWORD_TOO_SHORT");
    let profileId = user.id || "";
    let authUserId: string;
    if (profileId) {
      const current = await admin.from("profiles").select("auth_user_id, role").eq("id", profileId).single();
      if (current.error || !current.data?.auth_user_id) return jsonResponse({ error: "USER_NOT_FOUND" }, 404);
      if (current.data.role === "owner" && profileId !== actor.data.id) return jsonResponse({ error: "OWNER_EDIT_FORBIDDEN" }, 403);
      authUserId = current.data.auth_user_id;
      const authUpdated = await admin.auth.admin.updateUserById(authUserId, {
        email: technicalEmailForUsername(username),
        ...(requestedPassword ? { password: requestedPassword } : {}),
      });
      if (authUpdated.error) throw authUpdated.error;
      const updated = await admin.from("profiles").update({ username, display_name: displayName, role: user.role === "OWNER" ? "owner" : "commercial", status: user.active === false ? "disabled" : "active" }).eq("id", profileId);
      if (updated.error) throw updated.error;
    } else {
      if (requestedPassword.length < 8) throw new Error("PASSWORD_TOO_SHORT");
      const created = await admin.auth.admin.createUser({ email: technicalEmailForUsername(username), password: requestedPassword, email_confirm: true });
      if (created.error || !created.data.user) throw created.error || new Error("AUTH_USER_CREATION_FAILED");
      authUserId = created.data.user.id;
      createdAuthUserId = authUserId;
      const inserted = await admin.from("profiles").insert({ auth_user_id: authUserId, username, display_name: displayName, role: user.role === "OWNER" ? "owner" : "commercial", status: "active" }).select("id").single();
      if (inserted.error || !inserted.data) throw inserted.error || new Error("PROFILE_CREATION_FAILED");
      profileId = inserted.data.id;
    }
    await admin.from("user_cities").delete().eq("profile_id", profileId);
    const cityIds = Array.from(new Set(user.allowedCityIds || []));
    if (cityIds.length) {
      const cities = await admin.from("user_cities").insert(cityIds.map((cityId) => ({ profile_id: profileId, city_id: cityId })));
      if (cities.error) throw cities.error;
    }
    const productRow: Record<string, unknown> = { profile_id: profileId };
    for (const [permission, column] of Object.entries(permissionMap)) productRow[column] = user.permissions?.product?.[permission] === true;
    const productPermissions = await admin.from("user_product_permissions").upsert(productRow, { onConflict: "profile_id" });
    if (productPermissions.error) throw productPermissions.error;
    const accessPermissions = await admin.from("user_access_permissions").upsert({ profile_id: profileId, manage_requests_for_assigned_cities: user.permissions?.accessRequests?.manageAssignedCities === true }, { onConflict: "profile_id" });
    if (accessPermissions.error) throw accessPermissions.error;
    createdAuthUserId = null;
    return jsonResponse({ profileId });
  } catch (error) {
    if (createdAuthUserId) {
      try { await createAdminClient().auth.admin.deleteUser(createdAuthUserId); } catch { /* compensação de melhor esforço */ }
    }
    console.error("manage-user failed", error);
    return jsonResponse({ error: "USER_OPERATION_FAILED" }, 500);
  }
});
