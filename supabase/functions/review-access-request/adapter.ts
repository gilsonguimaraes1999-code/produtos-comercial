import { reviewAccessRequest, type StoredRequest } from './handler.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export type ReviewAccessRequestRuntime = {
  authenticate(token: string): Promise<string | null>;
  loadReviewer(actorAuthUserId: string): Promise<string | null>;
  loadRequest(requestId: string): Promise<StoredRequest>;
  createAuthUser(username: string): Promise<string>;
  deleteAuthUser(authUserId: string): Promise<void>;
  rpcReview(input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    cityIds: string[];
    authUserId: string | null;
    reviewKey: string;
    reason: string;
  }): Promise<string | null>;
  saveRejectionReason(requestId: string, reviewKey: string, reason: string): Promise<void>;
  loadReviewedRequest(requestId: string): Promise<Record<string, unknown>>;
  loadProfile(profileId: string): Promise<Record<string, unknown>>;
  issueActivation(profileId: string, reviewerId: string | null): Promise<unknown>;
};

export async function handleReviewAccessRequestHttp(
  request: Request,
  createRuntime: (authorization: string) => ReviewAccessRequestRuntime,
) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const authorization = request.headers.get('Authorization') || '';
    const runtime = createRuntime(authorization);
    const token = authorization.replace(/^Bearer\s+/i, '');
    const actorAuthUserId = await runtime.authenticate(token);
    if (!actorAuthUserId) return jsonResponse({ error: 'AUTH_REQUIRED' }, 401);
    const body = await request.json();
    const reviewerId = await runtime.loadReviewer(actorAuthUserId);

    const response = await reviewAccessRequest(body, {
      loadRequest: (requestId) => runtime.loadRequest(requestId),
      createAuthUser: (username) => runtime.createAuthUser(username),
      deleteAuthUser: (authUserId) => runtime.deleteAuthUser(authUserId),
      async review(input) {
        const profileId = await runtime.rpcReview(input);
        if (input.decision === 'rejected' && input.reason) {
          await runtime.saveRejectionReason(input.requestId, input.reviewKey, input.reason);
        }
        return profileId;
      },
      loadReviewedRequest: (requestId) => runtime.loadReviewedRequest(requestId),
      loadProfile: (profileId) => runtime.loadProfile(profileId),
      issueActivation: (profileId) => runtime.issueActivation(profileId, reviewerId),
    });
    return jsonResponse(response);
  } catch (error) {
    console.error('review-access-request failed', error);
    const message = error instanceof Error ? error.message : '';
    const known = ['REVIEW_DATA_REQUIRED', 'REQUEST_PERMISSION_DENIED', 'REQUEST_NOT_PENDING', 'CITY_NOT_REQUESTED', 'APPROVAL_DATA_REQUIRED', 'AUTH_USER_CREATION_FAILED'].find((code) => message.includes(code));
    const status = known === 'REQUEST_PERMISSION_DENIED' ? 403 : known === 'REQUEST_NOT_PENDING' ? 409 : 400;
    return jsonResponse({ error: known || 'ACCESS_REQUEST_REVIEW_FAILED' }, status);
  }
}
