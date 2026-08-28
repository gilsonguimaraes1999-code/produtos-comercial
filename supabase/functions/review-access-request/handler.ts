export type ReviewAccessRequestBody = {
  requestId?: string;
  decision?: 'approved' | 'rejected';
  cityIds?: string[];
  reason?: string;
  reviewKey?: string;
};

export type StoredRequest = {
  id: string;
  username: string;
  status: string;
  review_key?: string | null;
};

export type ReviewAccessRequestDependencies = {
  loadRequest(requestId: string): Promise<StoredRequest>;
  createAuthUser(username: string): Promise<string>;
  deleteAuthUser(authUserId: string): Promise<void>;
  review(input: {
    requestId: string;
    decision: 'approved' | 'rejected';
    cityIds: string[];
    authUserId: string | null;
    reviewKey: string;
    reason: string;
  }): Promise<string | null>;
  loadReviewedRequest(requestId: string): Promise<Record<string, unknown>>;
  loadProfile(profileId: string): Promise<Record<string, unknown>>;
  issueActivation(profileId: string): Promise<unknown>;
};

export async function reviewAccessRequest(
  body: ReviewAccessRequestBody,
  dependencies: ReviewAccessRequestDependencies,
) {
  if (!body.requestId || !body.decision || !body.reviewKey) {
    throw new Error('REVIEW_DATA_REQUIRED');
  }

  let createdAuthUserId: string | null = null;
  try {
    const requestBefore = await dependencies.loadRequest(body.requestId);
    const repeatedDecision = requestBefore.review_key === body.reviewKey && requestBefore.status === body.decision;

    if (body.decision === 'approved' && requestBefore.status === 'pending') {
      createdAuthUserId = await dependencies.createAuthUser(requestBefore.username);
    } else if (!repeatedDecision && requestBefore.status !== 'pending') {
      throw new Error('REQUEST_NOT_PENDING');
    }

    const profileId = await dependencies.review({
      requestId: body.requestId,
      decision: body.decision,
      cityIds: body.decision === 'approved' ? (body.cityIds || []) : [],
      authUserId: createdAuthUserId,
      reviewKey: body.reviewKey,
      reason: body.reason || '',
    });
    createdAuthUserId = null;
    const request = await dependencies.loadReviewedRequest(body.requestId);

    if (body.decision === 'rejected') return { ok: true, request };
    if (!profileId) throw new Error('APPROVAL_PROFILE_MISSING');

    const user = await dependencies.loadProfile(profileId);
    const activation = repeatedDecision ? null : await dependencies.issueActivation(profileId);
    return { ok: true, request, user, activation };
  } catch (error) {
    if (createdAuthUserId) {
      try {
        await dependencies.deleteAuthUser(createdAuthUserId);
      } catch {
        // Compensação de melhor esforço; o erro original deve ser preservado.
      }
    }
    throw error;
  }
}
