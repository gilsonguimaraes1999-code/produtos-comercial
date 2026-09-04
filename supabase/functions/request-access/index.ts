import {
  createAdminClient,
  technicalEmailForUsername,
} from "../_shared/admin.ts";
import { handleRequestAccessHttp } from "./adapter.ts";

Deno.serve((request) => handleRequestAccessHttp(request, () => {
  const admin = createAdminClient();

  return {
    async findBySubmissionKey(submissionKey: string) {
      const result = await admin
        .from("access_requests")
        .select("id")
        .eq("submission_key", submissionKey)
        .maybeSingle();
      if (result.error) throw result.error;
      return result.data?.id ? String(result.data.id) : null;
    },

    async createAuthUser(username: string, password: string) {
      const result = await admin.auth.admin.createUser({
        email: technicalEmailForUsername(username),
        password,
        email_confirm: true,
      });
      if (result.error || !result.data.user) {
        const duplicate = result.error?.code === "email_exists" ||
          /already registered|already exists/i.test(result.error?.message || "");
        throw new Error(duplicate ? "ACCOUNT_ALREADY_EXISTS" : "AUTH_USER_CREATION_FAILED");
      }
      return result.data.user.id;
    },

    async submitRequest(input: {
      displayName: string;
      username: string;
      cityIds: string[];
      trackingSecret: string;
      submissionKey: string;
      pendingAuthUserId: string;
    }) {
      const result = await admin.rpc("submit_access_request_v3", {
        request_display_name: input.displayName,
        request_username: input.username,
        requested_city_ids: input.cityIds,
        tracking_secret: input.trackingSecret,
        request_submission_key: input.submissionKey,
        new_pending_auth_user_id: input.pendingAuthUserId,
      });
      if (result.error) throw result.error;
      return String(result.data);
    },

    async deleteAuthUser(authUserId: string) {
      const result = await admin.auth.admin.deleteUser(authUserId);
      if (result.error) throw result.error;
    },
  };
}));
