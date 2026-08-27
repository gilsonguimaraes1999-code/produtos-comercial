import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { AccessRequest, AccessRequestPayload } from "../types";

function assertFunction(result: { data?: { error?: string } | null; error?: { message?: string } | null }) {
  if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "ACCESS_REQUEST_FAILED");
}

export function createAccessRequestsRepository(client: SupabaseClient) {
  return {
    async list(): Promise<AccessRequest[]> {
      const result = await client.rpc("list_access_requests_for_management");
      if (result.error) throw new Error(result.error.message || "ACCESS_REQUESTS_LOAD_FAILED");
      return (result.data || []).map((row: Record<string, unknown>) => ({
        id: String(row.id),
        name: String(row.display_name || ""),
        username: String(row.username || ""),
        cityName: String(row.primary_city_name || ""),
        requestedCityNames: Array.isArray(row.city_names) ? row.city_names.map(String) : [],
        approvedCityIds: Array.isArray(row.approved_city_ids) ? row.approved_city_ids.map((item) => typeof item === "object" && item !== null && "id" in item ? String((item as { id: unknown }).id) : String(item)) : [],
        status: row.status === "approved" ? "APROVADO" : row.status === "rejected" ? "REPROVADO" : row.status === "removed" ? "REMOVIDO" : "PENDENTE",
        approved: row.status === "approved",
        createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
        reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : undefined,
        reviewedBy: typeof row.reviewed_by_name === "string" ? row.reviewed_by_name : undefined,
      }));
    },

    async create(payload: AccessRequestPayload, cityIds: string[]): Promise<string> {
      const result = await client.functions.invoke("request-access", {
        body: { displayName: payload.name.trim(), username: payload.username.trim(), cityIds },
      });
      assertFunction(result);
      return String(result.data?.requestId || "");
    },

    async approve(requestId: string, cityIds: string[]): Promise<void> {
      const result = await client.functions.invoke("review-access-request", { body: { requestId, decision: "approved", cityIds } });
      assertFunction(result);
    },

    async reject(requestId: string, reason = ""): Promise<void> {
      const result = await client.functions.invoke("review-access-request", { body: { requestId, decision: "rejected", reason } });
      assertFunction(result);
    },
  };
}

export function getAccessRequestsRepository() {
  return createAccessRequestsRepository(getSupabaseBrowserClient());
}
