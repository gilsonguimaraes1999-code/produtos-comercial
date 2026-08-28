import { handleReviewAccessRequestHttp } from './adapter.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('adapter authenticates, parses the request, wires review RPC, and maps the response', async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const authTokens: string[] = [];
  const response = await handleReviewAccessRequestHttp(
    new Request('http://localhost/review-access-request', {
      method: 'POST',
      headers: { Authorization: 'Bearer signed-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'request-1', decision: 'approved', cityIds: ['city-1'], reviewKey: 'review-1' }),
    }),
    (authorization) => {
      assert(authorization === 'Bearer signed-token', 'factory did not receive authorization header');
      return {
        async authenticate(token: string) { authTokens.push(token); return 'actor-auth-1'; },
        async loadReviewer() { return 'reviewer-1'; },
        async loadRequest() { return { id: 'request-1', username: 'ana', status: 'pending', review_key: null }; },
        async createAuthUser() { return 'auth-user-1'; },
        async deleteAuthUser() {},
        async rpcReview(input: Record<string, unknown>) { rpcCalls.push(input); return 'profile-1'; },
        async saveRejectionReason() {},
        async loadReviewedRequest() { return { id: 'request-1', status: 'approved' }; },
        async loadProfile() { return { id: 'profile-1', status: 'pending_activation' }; },
        async issueActivation() { return { code: 'ACTIVATION' }; },
      };
    },
  );

  assert(response.status === 200, `expected 200, got ${response.status}`);
  assert(authTokens[0] === 'signed-token', 'bearer token was not parsed for authentication');
  assert(rpcCalls.length === 1, 'review RPC was not called exactly once');
  assert(rpcCalls[0]?.requestId === 'request-1', 'request id was not wired to the RPC');
  assert(rpcCalls[0]?.reviewKey === 'review-1', 'review key was not wired to the RPC');
  assert(rpcCalls[0]?.authUserId === 'auth-user-1', 'created auth user was not wired to the RPC');
  const body = await response.json();
  assert(body.ok === true, 'success response missing ok');
  assert(body.request?.status === 'approved', 'reviewed request missing from response');
  assert(body.user?.status === 'pending_activation', 'created profile missing from response');
  assert(body.activation?.code === 'ACTIVATION', 'activation missing from response');
});

Deno.test('adapter rejects an unauthenticated request before RPC wiring', async () => {
  let rpcCalled = false;
  const response = await handleReviewAccessRequestHttp(
    new Request('http://localhost/review-access-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'request-1', decision: 'rejected', reviewKey: 'review-1' }),
    }),
    () => ({
      async authenticate() { return null; },
      async loadReviewer() { return null; },
      async loadRequest() { throw new Error('must not load request'); },
      async createAuthUser() { throw new Error('must not create auth user'); },
      async deleteAuthUser() {},
      async rpcReview() { rpcCalled = true; return null; },
      async saveRejectionReason() {},
      async loadReviewedRequest() { return {}; },
      async loadProfile() { return {}; },
      async issueActivation() { return null; },
    }),
  );

  assert(response.status === 401, `expected 401, got ${response.status}`);
  assert(rpcCalled === false, 'RPC must not run before authentication');
  const body = await response.json();
  assert(body.error === 'AUTH_REQUIRED', 'unauthorized response mapping is wrong');
});
