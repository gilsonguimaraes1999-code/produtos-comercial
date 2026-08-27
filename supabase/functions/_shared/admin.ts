import { createClient } from "jsr:@supabase/supabase-js@2";

export function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_ADMIN_NOT_CONFIGURED");

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(authorization: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) throw new Error("SUPABASE_CLIENT_NOT_CONFIGURED");

  return createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

const activationAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function technicalEmailForUsername(username: string): string {
  const asciiLocalPart = encodeURIComponent(normalizeUsername(username))
    .replaceAll("%", "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!asciiLocalPart) throw new Error("USERNAME_INVALID");
  return `${asciiLocalPart}@users.comercial-produtos.app`;
}

export function randomSecret(length = 32): string {
  const random = new Uint32Array(length);
  crypto.getRandomValues(random);
  return Array.from(random, (value) => activationAlphabet[value % activationAlphabet.length]).join("");
}

export async function issueActivationCode(admin: ReturnType<typeof createAdminClient>, profileId: string, createdBy?: string | null) {
  const code = randomSecret(10);
  const codeHash = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await admin.from("activation_codes").update({ consumed_at: new Date().toISOString() }).eq("profile_id", profileId).is("consumed_at", null);
  const inserted = await admin.from("activation_codes").insert({ profile_id: profileId, code_hash: codeHash, expires_at: expiresAt, created_by: createdBy || null });
  if (inserted.error) throw inserted.error;
  return { code, expiresAt };
}
