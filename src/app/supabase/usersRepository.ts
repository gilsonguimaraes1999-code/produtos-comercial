import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { AuthUser, ProductPermission, UserPayload, UserPermissions } from "../types";

const permissionColumns: Record<ProductPermission, string> = {
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

function throwFunctionError(result: { data?: { error?: string } | null; error?: { message?: string } | null }) {
  if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "USER_OPERATION_FAILED");
}

function mapPermissions(raw: Record<string, unknown> = {}): UserPermissions["product"] {
  return Object.fromEntries(Object.entries(permissionColumns).map(([key, column]) => [key, raw[column] === true])) as UserPermissions["product"];
}

export function createUsersRepository(client: SupabaseClient) {
  return {
    async list(): Promise<AuthUser[]> {
      const result = await client.rpc("list_users_for_management");
      if (result.error) throw new Error(result.error.message || "USERS_LOAD_FAILED");
      return (result.data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.display_name || ""),
        username: String(row.username || ""),
        role: row.role === "owner" ? "OWNER" : "COMERCIAL",
        status: row.status === "active" ? "Ativo" : "Desativado",
        allowedCityIds: Array.isArray(row.city_ids) ? row.city_ids.map(String) : [],
        permissions: {
          product: mapPermissions((row.product_permissions || {}) as Record<string, unknown>),
          accessRequests: { manageAssignedCities: row.manage_requests === true },
        },
        createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
      }));
    },

    async save(user: UserPayload): Promise<string> {
      const result = await client.functions.invoke("manage-user", { body: { action: "save", user } });
      throwFunctionError(result);
      return String(result.data?.profileId || user.id || "");
    },

    async remove(profileId: string): Promise<void> {
      const result = await client.functions.invoke("manage-user", { body: { action: "delete", profileId } });
      throwFunctionError(result);
    },

    async createActivationCode(profileId: string): Promise<{ code: string; expiresAt: string }> {
      const result = await client.functions.invoke("create-activation-code", { body: { profileId } });
      throwFunctionError(result);
      return { code: String(result.data?.code || ""), expiresAt: String(result.data?.expiresAt || "") };
    },
  };
}

export function getUsersRepository() {
  return createUsersRepository(getSupabaseBrowserClient());
}
