import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type {
  AuthUser,
  ProductPermission,
  SessionData,
  UserPermissions,
} from "../types";

const TECHNICAL_EMAIL_DOMAIN = "users.comercial-produtos.app";

type AuthUserLoader = (
  client: SupabaseClient,
  authUserId: string,
) => Promise<AuthUser>;

interface ProfileRow {
  id: string;
  username: string;
  display_name: string;
  role: "owner" | "commercial";
  status: "pending_activation" | "active" | "disabled";
  created_at: string;
  updated_at: string;
}

type ProductPermissionRow = Record<string, boolean | string>;

async function getFunctionError(error: unknown): Promise<Error & { code?: string }> {
  const context = typeof error === "object" && error !== null && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  let code = "ACTIVATION_FAILED";

  if (context instanceof Response) {
    try {
      const payload = (await context.clone().json()) as { error?: unknown };
      if (typeof payload.error === "string" && payload.error) code = payload.error;
    } catch {
      // A resposta sem JSON recebe o código estável genérico.
    }
  }

  return Object.assign(new Error(code), { code });
}

const productPermissionColumns: Record<ProductPermission, string> = {
  createProduct: "create_product",
  editProductCategory: "edit_product_category",
  editProductName: "edit_product_name",
  editProductPrice: "edit_product_price",
  editProductDescription: "edit_product_description",
  editProductMedia: "edit_product_media",
  markProductSold: "mark_product_sold",
  viewSoldDiscordId: "view_owner_discord_id",
  cloneProduct: "clone_product",
  cloneCategory: "clone_category",
  deleteProduct: "delete_product",
  moveProduct: "move_product",
};

export function normalizeUsername(username: string): string {
  return username.trim().toLocaleLowerCase("en-US");
}

export function usernameToTechnicalEmail(username: string): string {
  const normalized = normalizeUsername(username);
  if (!normalized || /\s/.test(normalized)) {
    throw new Error("USERNAME_INVALID");
  }
  const asciiLocalPart = encodeURIComponent(normalized)
    .replaceAll("%", "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");
  if (!asciiLocalPart) throw new Error("USERNAME_INVALID");
  return `${asciiLocalPart}@${TECHNICAL_EMAIL_DOMAIN}`;
}

export async function loadAuthUser(
  client: SupabaseClient,
  authUserId: string,
): Promise<AuthUser> {
  const profileResult = await client
    .from("profiles")
    .select(
      "id, username, display_name, role, status, created_at, updated_at",
    )
    .eq("auth_user_id", authUserId)
    .single();

  if (profileResult.error || !profileResult.data) {
    throw new Error(profileResult.error?.message || "PROFILE_NOT_FOUND");
  }

  const profile = profileResult.data as ProfileRow;
  const [citiesResult, productPermissionsResult, accessPermissionsResult] =
    await Promise.all([
      client.from("user_cities").select("city_id").eq("profile_id", profile.id),
      client
        .from("user_product_permissions")
        .select("*")
        .eq("profile_id", profile.id)
        .maybeSingle(),
      client
        .from("user_access_permissions")
        .select("manage_requests_for_assigned_cities")
        .eq("profile_id", profile.id)
        .maybeSingle(),
    ]);

  const permissionRow = (productPermissionsResult.data || {}) as ProductPermissionRow;
  const productPermissions = Object.fromEntries(
    Object.entries(productPermissionColumns).map(([permission, column]) => [
      permission,
      permissionRow[column] === true,
    ]),
  ) as UserPermissions["product"];

  return {
    id: profile.id,
    name: profile.display_name,
    username: profile.username,
    role: profile.role === "owner" ? "OWNER" : "COMERCIAL",
    status: profile.status === "active" ? "Ativo" : "Desativado",
    allowedCityIds: (citiesResult.data || []).map((row) => row.city_id),
    permissions: {
      product: productPermissions,
      accessRequests: {
        manageAssignedCities:
          accessPermissionsResult.data
            ?.manage_requests_for_assigned_cities === true,
      },
    },
    createdAt: profile.created_at,
    updatedAt: profile.updated_at,
  };
}

export function createAuthRepository(
  client: SupabaseClient,
  userLoader: AuthUserLoader = loadAuthUser,
) {
  return {
    async login(username: string, password: string): Promise<SessionData> {
      const result = await client.auth.signInWithPassword({
        email: usernameToTechnicalEmail(username),
        password,
      });

      if (result.error || !result.data.session || !result.data.user) {
        throw new Error(result.error?.message || "INVALID_CREDENTIALS");
      }

      const user = await userLoader(client, result.data.user.id);
      return { token: result.data.session.access_token, user };
    },

    async getCurrentSessionData(): Promise<SessionData | null> {
      const result = await client.auth.getSession();
      const session = result.data.session;
      if (result.error || !session?.user) return null;
      const user = await userLoader(client, session.user.id);
      return { token: session.access_token, user };
    },

    async activate(input: {
      username: string;
      code: string;
      password: string;
    }): Promise<void> {
      const result = await client.functions.invoke("activate-user", {
        body: {
          username: normalizeUsername(input.username),
          code: input.code.trim().toUpperCase(),
          password: input.password,
        },
      });
      if (result.error) throw await getFunctionError(result.error);
      if (result.data?.error) {
        throw Object.assign(new Error(result.data.error), { code: result.data.error });
      }
    },

    async logout(): Promise<void> {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
    },
  };
}

export function getAuthRepository() {
  return createAuthRepository(getSupabaseBrowserClient());
}
