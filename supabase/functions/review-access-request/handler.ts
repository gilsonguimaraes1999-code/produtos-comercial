export type ReviewAccessRequestBody = {
  requestId?: string;
  decision?: "approved" | "rejected";
  cityIds?: string[];
  reason?: string;
  reviewKey?: string;
};

export type StoredRequest = {
  id: string;
  username: string;
  status: string;
  review_key?: string | null;
  pending_auth_user_id?: string | null;
};

export type ReviewAccessRequestDependencies = {
  loadRequest(requestId: string): Promise<StoredRequest>;
  deleteAuthUser(authUserId: string): Promise<void>;
  review(input: {
    requestId: string;
    decision: "approved" | "rejected";
    cityIds: string[];
    reviewKey: string;
    reason: string;
  }): Promise<string | null>;
  loadReviewedRequest(requestId: string): Promise<Record<string, unknown>>;
  loadProfile(profileId: string): Promise<Record<string, unknown>>;
};

export async function reviewAccessRequest(
  body: ReviewAccessRequestBody,
  dependencies: ReviewAccessRequestDependencies,
) {
  if (!body.requestId || !body.decision || !body.reviewKey) {
    throw new Error("REVIEW_DATA_REQUIRED");
  }

  const requestBefore = await dependencies.loadRequest(body.requestId);
  const repeatedDecision = requestBefore.review_key === body.reviewKey &&
    requestBefore.status === body.decision;
  if (!repeatedDecision && requestBefore.status !== "pending") {
    throw new Error("REQUEST_NOT_PENDING");
  }

  const profileId = await dependencies.review({
    requestId: body.requestId,
    decision: body.decision,
    cityIds: body.decision === "approved" ? (body.cityIds || []) : [],
    reviewKey: body.reviewKey,
    reason: body.reason || "",
  });
  const reviewedRequest = await dependencies.loadReviewedRequest(body.requestId);

  if (body.decision === "rejected") {
    if (requestBefore.pending_auth_user_id) {
      await dependencies.deleteAuthUser(requestBefore.pending_auth_user_id);
    }
    return { ok: true, request: reviewedRequest };
  }

  if (!profileId) throw new Error("APPROVAL_PROFILE_MISSING");
  const user = await dependencies.loadProfile(profileId);
  return { ok: true, request: reviewedRequest, user };
}
