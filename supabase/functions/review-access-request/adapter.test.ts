import { describe, expect, it, vi } from "vitest";

import { handleReviewAccessRequestHttp } from "./adapter";

describe("review access request HTTP adapter", () => {
  it("returns an active approved profile without activation data", async () => {
    const deleteAuthUser = vi.fn();
    const response = await handleReviewAccessRequestHttp(
      new Request("http://localhost/review-access-request", {
        method: "POST",
        headers: { Authorization: "Bearer signed-token", "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "request-1", decision: "approved", cityIds: ["city-1"], reviewKey: "review-1" }),
      }),
      () => ({
        authenticate: vi.fn().mockResolvedValue("actor-auth-1"),
        loadRequest: vi.fn().mockResolvedValue({ id: "request-1", username: "ana", status: "pending", pending_auth_user_id: "auth-1" }),
        deleteAuthUser,
        rpcReview: vi.fn().mockResolvedValue("profile-1"),
        loadReviewedRequest: vi.fn().mockResolvedValue({ id: "request-1", status: "approved" }),
        loadProfile: vi.fn().mockResolvedValue({ id: "profile-1", status: "active" }),
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, user: { status: "active" } });
    expect(body).not.toHaveProperty("activation");
    expect(deleteAuthUser).not.toHaveBeenCalled();
  });
});
