import { createAdminClient, createUserClient } from "../_shared/admin.ts";
import { handleReviewAccessRequestHttp } from "./adapter.ts";

Deno.serve((request) => handleReviewAccessRequestHttp(request, (authorization) => {
  const admin = createAdminClient();
  const userClient = createUserClient(authorization);

  return {
    async authenticate(token: string) {
      const actor = await admin.auth.getUser(token);
      return actor.error || !actor.data.user ? null : actor.data.user.id;
    },

    async loadRequest(requestId: string) {
      const result = await admin
        .from("access_requests")
        .select("id, username, status, review_key, pending_auth_user_id")
        .eq("id", requestId)
        .single();
      if (result.error || !result.data) throw new Error("REQUEST_NOT_PENDING");
      return result.data;
    },

    async deleteAuthUser(authUserId: string) {
      const result = await admin.auth.admin.deleteUser(authUserId);
      if (result.error && !/not found/i.test(result.error.message)) throw result.error;
    },

    async rpcReview(input: {
      requestId: string;
      decision: "approved" | "rejected";
      cityIds: string[];
      reviewKey: string;
      reason: string;
    }) {
      const result = await userClient.rpc("review_access_request_v3", {
        target_request_id: input.requestId,
        decision: input.decision,
        approved_city_ids: input.cityIds,
        request_review_key: input.reviewKey,
        rejection_reason: input.reason,
      });
      if (result.error) throw result.error;
      return result.data ? String(result.data) : null;
    },

    async loadReviewedRequest(requestId: string) {
      const result = await admin
        .from("access_requests")
        .select("id, display_name, username, status, reviewed_at, rejection_reason, created_at, updated_at")
        .eq("id", requestId)
        .single();
      if (result.error || !result.data) throw result.error || new Error("REQUEST_NOT_FOUND");
      return result.data;
    },

    async loadProfile(profileId: string) {
      const result = await admin
        .from("profiles")
        .select("id, display_name, username, role, status, created_at, updated_at")
        .eq("id", profileId)
        .single();
      if (result.error || !result.data) throw result.error || new Error("PROFILE_NOT_FOUND");
      return result.data;
    },
  };
}));
