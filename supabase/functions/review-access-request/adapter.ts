import { reviewAccessRequest, type StoredRequest } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type ReviewAccessRequestRuntime = {
  authenticate(token: string): Promise<string | null>;
  loadRequest(requestId: string): Promise<StoredRequest>;
  deleteAuthUser(authUserId: string): Promise<void>;
  rpcReview(input: {
    requestId: string;
    decision: "approved" | "rejected";
    cityIds: string[];
    reviewKey: string;
    reason: string;
  }): Promise<string | null>;
  loadReviewedRequest(requestId: string): Promise<Record<string, unknown>>;
  loadProfile(profileId: string): Promise<Record<string, unknown>>;
};

export async function handleReviewAccessRequestHttp(
  request: Request,
  createRuntime: (authorization: string) => ReviewAccessRequestRuntime,
) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const runtime = createRuntime(authorization);
    const token = authorization.replace(/^Bearer\s+/i, "");
    const actorAuthUserId = await runtime.authenticate(token);
    if (!actorAuthUserId) return jsonResponse({ error: "AUTH_REQUIRED" }, 401);

    const response = await reviewAccessRequest(await request.json(), {
      loadRequest: (requestId) => runtime.loadRequest(requestId),
      deleteAuthUser: (authUserId) => runtime.deleteAuthUser(authUserId),
      review: (input) => runtime.rpcReview(input),
      loadReviewedRequest: (requestId) => runtime.loadReviewedRequest(requestId),
      loadProfile: (profileId) => runtime.loadProfile(profileId),
    });
    return jsonResponse(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "REVIEW_DATA_REQUIRED",
      "REQUEST_PERMISSION_DENIED",
      "REQUEST_NOT_PENDING",
      "CITY_NOT_REQUESTED",
      "APPROVAL_DATA_REQUIRED",
      "APPROVAL_PROFILE_MISSING",
    ].find((code) => message.includes(code));
    const status = known === "REQUEST_PERMISSION_DENIED"
      ? 403
      : known === "REQUEST_NOT_PENDING"
        ? 409
        : 400;
    return jsonResponse({ error: known || "ACCESS_REQUEST_REVIEW_FAILED" }, status);
  }
}
