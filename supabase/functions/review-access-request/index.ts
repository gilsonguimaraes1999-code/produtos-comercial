import { createAdminClient, createUserClient, issueActivationCode, randomSecret, technicalEmailForUsername } from '../_shared/admin.ts';
import { handleReviewAccessRequestHttp } from './adapter.ts';

Deno.serve((request) => handleReviewAccessRequestHttp(request, (authorization) => {
  const admin = createAdminClient();
  const userClient = createUserClient(authorization);

  return {
    async authenticate(token: string) {
      const actor = await admin.auth.getUser(token);
      return actor.error || !actor.data.user ? null : actor.data.user.id;
    },
    async loadReviewer(actorAuthUserId: string) {
      const reviewer = await admin.from('profiles').select('id').eq('auth_user_id', actorAuthUserId).single();
      return reviewer.data?.id || null;
    },
    async loadRequest(requestId: string) {
      const result = await admin.from('access_requests').select('id, username, status, review_key').eq('id', requestId).single();
      if (result.error || !result.data) throw new Error('REQUEST_NOT_PENDING');
      return result.data;
    },
    async createAuthUser(username: string) {
      const result = await admin.auth.admin.createUser({
        email: technicalEmailForUsername(username),
        password: randomSecret(),
        email_confirm: true,
      });
      if (result.error || !result.data.user) throw new Error('AUTH_USER_CREATION_FAILED');
      return result.data.user.id;
    },
    async deleteAuthUser(authUserId: string) {
      await admin.auth.admin.deleteUser(authUserId);
    },
    async rpcReview(input) {
      const result = await userClient.rpc('review_access_request_v2', {
        target_request_id: input.requestId,
        decision: input.decision,
        approved_city_ids: input.cityIds,
        new_auth_user_id: input.authUserId,
        request_review_key: input.reviewKey,
      });
      if (result.error) throw result.error;
      return result.data ? String(result.data) : null;
    },
    async saveRejectionReason(requestId: string, reviewKey: string, reason: string) {
      const result = await admin.from('access_requests').update({ rejection_reason: reason }).eq('id', requestId).eq('review_key', reviewKey);
      if (result.error) throw result.error;
    },
    async loadReviewedRequest(requestId: string) {
      const result = await admin.from('access_requests').select('id, display_name, username, status, reviewed_at, rejection_reason, created_at, updated_at').eq('id', requestId).single();
      if (result.error || !result.data) throw result.error || new Error('REQUEST_NOT_FOUND');
      return result.data;
    },
    async loadProfile(profileId: string) {
      const result = await admin.from('profiles').select('id, display_name, username, role, status, created_at, updated_at').eq('id', profileId).single();
      if (result.error || !result.data) throw result.error || new Error('PROFILE_NOT_FOUND');
      return result.data;
    },
    issueActivation(profileId: string, reviewerId: string | null) {
      return issueActivationCode(admin, profileId, reviewerId);
    },
  };
}));
