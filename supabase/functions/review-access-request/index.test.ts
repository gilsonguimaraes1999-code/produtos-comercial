import { describe, expect, it, vi } from "vitest";

import { reviewAccessRequest } from "./handler";

function dependencies(request: Record<string, unknown>) {
  return {
    loadRequest: vi.fn().mockResolvedValue(request),
    deleteAuthUser: vi.fn().mockResolvedValue(undefined),
    review: vi.fn().mockResolvedValue("profile-1"),
    loadReviewedRequest: vi.fn().mockResolvedValue({ id: "request-1", status: "approved" }),
    loadProfile: vi.fn().mockResolvedValue({ id: "profile-1", status: "active" }),
  };
}

describe("review access request handler", () => {
  it("approves the reserved identity as an active user without activation data", async () => {
    const deps = dependencies({
      id: "request-1",
      username: "ana",
      status: "pending",
      review_key: null,
      pending_auth_user_id: "auth-1",
    });

    const response = await reviewAccessRequest({
      requestId: "request-1",
      decision: "approved",
      cityIds: ["city-1"],
      reviewKey: "review-1",
    }, deps);

    expect(deps.review).toHaveBeenCalledWith({
      requestId: "request-1",
      decision: "approved",
      cityIds: ["city-1"],
      reviewKey: "review-1",
      reason: "",
    });
    expect(response).toEqual({
      ok: true,
      request: { id: "request-1", status: "approved" },
      user: { id: "profile-1", status: "active" },
    });
    expect(response).not.toHaveProperty("activation");
  });

  it("does not create or change identities when the same approval is retried", async () => {
    const deps = dependencies({
      id: "request-1",
      username: "ana",
      status: "approved",
      review_key: "review-1",
      pending_auth_user_id: "auth-1",
    });

    await expect(reviewAccessRequest({
      requestId: "request-1",
      decision: "approved",
      cityIds: ["city-1"],
      reviewKey: "review-1",
    }, deps)).resolves.toMatchObject({ user: { status: "active" } });
    expect(deps.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("deletes the reserved identity after rejection", async () => {
    const deps = dependencies({
      id: "request-2",
      username: "bia",
      status: "pending",
      review_key: null,
      pending_auth_user_id: "auth-2",
    });
    deps.review.mockResolvedValue(null);
    deps.loadReviewedRequest.mockResolvedValue({
      id: "request-2",
      status: "rejected",
      rejection_reason: "Dados inválidos",
    });

    const response = await reviewAccessRequest({
      requestId: "request-2",
      decision: "rejected",
      reason: "Dados inválidos",
      reviewKey: "review-2",
    }, deps);

    expect(deps.deleteAuthUser).toHaveBeenCalledWith("auth-2");
    expect(response).toEqual({
      ok: true,
      request: { id: "request-2", status: "rejected", rejection_reason: "Dados inválidos" },
    });
  });
});
