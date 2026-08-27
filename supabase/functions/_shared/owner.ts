import { createAdminClient } from "./admin.ts";

export async function requireOwner(authorization: string) {
  const admin = createAdminClient();
  const token = authorization.replace(/^Bearer\s+/i, "");
  const auth = await admin.auth.getUser(token);
  if (auth.error || !auth.data.user) throw new Error("AUTH_REQUIRED");
  const profile = await admin.from("profiles").select("id, role, status").eq("auth_user_id", auth.data.user.id).single();
  if (profile.error || profile.data?.role !== "owner" || profile.data.status !== "active") throw new Error("OWNER_REQUIRED");
  return { admin, profile: profile.data };
}
