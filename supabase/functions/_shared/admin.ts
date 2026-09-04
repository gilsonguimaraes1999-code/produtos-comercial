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

export function technicalEmailForUsername(username: string): string {
  const asciiLocalPart = encodeURIComponent(normalizeUsername(username))
    .replaceAll("%", "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!asciiLocalPart) throw new Error("USERNAME_INVALID");
  return `${asciiLocalPart}@users.comercial-produtos.app`;
}
