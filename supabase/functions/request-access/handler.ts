export type RequestAccessBody = {
  displayName?: string;
  username?: string;
  password?: string;
  cityIds?: string[];
  trackingSecret?: string;
  submissionKey?: string;
};

export type RequestAccessInput = {
  displayName: string;
  username: string;
  cityIds: string[];
  trackingSecret: string;
  submissionKey: string;
  pendingAuthUserId: string;
};

export type RequestAccessDependencies = {
  findBySubmissionKey(submissionKey: string): Promise<string | null>;
  createAuthUser(username: string, password: string): Promise<string>;
  submitRequest(input: RequestAccessInput): Promise<string>;
  deleteAuthUser(authUserId: string): Promise<void>;
};

function normalizedBody(body: RequestAccessBody) {
  const displayName = String(body.displayName || "").trim();
  const username = String(body.username || "").trim().toLocaleLowerCase("en-US");
  const password = String(body.password || "");
  const cityIds = Array.isArray(body.cityIds)
    ? [...new Set(body.cityIds.map(String).map((cityId) => cityId.trim()).filter(Boolean))]
    : [];
  const trackingSecret = String(body.trackingSecret || "").trim();
  const submissionKey = String(body.submissionKey || "").trim();

  if (displayName.length < 2) throw new Error("DISPLAY_NAME_INVALID");
  if (!/^[a-z0-9._-]{2,64}$/.test(username)) throw new Error("USERNAME_INVALID");
  if (password.length < 8 || password.length > 72) throw new Error("PASSWORD_INVALID");
  if (!cityIds.length) throw new Error("CITY_REQUIRED");
  if (trackingSecret.length < 32) throw new Error("TRACKING_SECRET_INVALID");
  if (!submissionKey) throw new Error("SUBMISSION_KEY_REQUIRED");

  return { displayName, username, password, cityIds, trackingSecret, submissionKey };
}

export async function requestAccess(
  body: RequestAccessBody,
  dependencies: RequestAccessDependencies,
): Promise<{ requestId: string }> {
  const input = normalizedBody(body);
  const existingRequestId = await dependencies.findBySubmissionKey(input.submissionKey);
  if (existingRequestId) return { requestId: existingRequestId };

  const authUserId = await dependencies.createAuthUser(input.username, input.password);
  try {
    const requestId = await dependencies.submitRequest({
      displayName: input.displayName,
      username: input.username,
      cityIds: input.cityIds,
      trackingSecret: input.trackingSecret,
      submissionKey: input.submissionKey,
      pendingAuthUserId: authUserId,
    });
    return { requestId };
  } catch (error) {
    try {
      await dependencies.deleteAuthUser(authUserId);
    } catch {
      // Preserve the persistence error; cleanup is best effort.
    }
    throw error;
  }
}
