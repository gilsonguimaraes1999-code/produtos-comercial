import { handleReviewAccessRequestHttp } from "./adapter.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("adapter approves a reserved identity without activation data", async () => {
  const response = await handleReviewAccessRequestHttp(
    new Request("http://localhost/review-access-request", {
      method: "POST",
      headers: { Authorization: "Bearer signed-token", "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "request-1", decision: "approved", cityIds: ["city-1"], reviewKey: "review-1" }),
    }),
    () => ({
      async authenticate() { return "actor-auth-1"; },
      async loadRequest() { return { id: "request-1", username: "ana", status: "pending", pending_auth_user_id: "auth-1" }; },
      async deleteAuthUser() {},
      async rpcReview() { return "profile-1"; },
      async loadReviewedRequest() { return { id: "request-1", status: "approved" }; },
      async loadProfile() { return { id: "profile-1", status: "active" }; },
    }),
  );

  assert(response.status === 200, `expected 200, got ${response.status}`);
  const body = await response.json();
  assert(body.user?.status === "active", "approved profile must be active");
  assert(!("activation" in body), "activation data must not be returned");
});

Deno.test("adapter rejects unauthenticated review before RPC", async () => {
  let rpcCalled = false;
  const response = await handleReviewAccessRequestHttp(
    new Request("http://localhost/review-access-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "request-1", decision: "rejected", reviewKey: "review-1" }),
    }),
    () => ({
      async authenticate() { return null; },
      async loadRequest() { throw new Error("must not load request"); },
      async deleteAuthUser() {},
      async rpcReview() { rpcCalled = true; return null; },
      async loadReviewedRequest() { return {}; },
      async loadProfile() { return {}; },
    }),
  );

  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(rpcCalled === false, "RPC must not run before authentication");
});
