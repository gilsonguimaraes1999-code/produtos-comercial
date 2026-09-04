import { describe, expect, it, vi } from "vitest";

import { requestAccess } from "./handler";

const validBody = {
  displayName: "Ana Silva",
  username: " Ana ",
  password: "safe-password",
  cityIds: ["city-1", "city-2"],
  trackingSecret: "a".repeat(64),
  submissionKey: "submission-1",
};

function dependencies() {
  return {
    findBySubmissionKey: vi.fn().mockResolvedValue(null),
    createAuthUser: vi.fn().mockResolvedValue("auth-1"),
    submitRequest: vi.fn().mockResolvedValue("request-1"),
    deleteAuthUser: vi.fn().mockResolvedValue(undefined),
  };
}

describe("request access handler", () => {
  it("creates the auth identity before persisting the request", async () => {
    const deps = dependencies();

    await expect(requestAccess(validBody, deps)).resolves.toEqual({ requestId: "request-1" });

    expect(deps.createAuthUser).toHaveBeenCalledWith("ana", "safe-password");
    expect(deps.submitRequest).toHaveBeenCalledWith({
      displayName: "Ana Silva",
      username: "ana",
      cityIds: ["city-1", "city-2"],
      trackingSecret: "a".repeat(64),
      submissionKey: "submission-1",
      pendingAuthUserId: "auth-1",
    });
    expect(deps.createAuthUser.mock.invocationCallOrder[0]).toBeLessThan(
      deps.submitRequest.mock.invocationCallOrder[0],
    );
  });

  it("deletes the reserved identity when persistence fails", async () => {
    const deps = dependencies();
    deps.submitRequest.mockRejectedValue(new Error("CITY_INVALID"));

    await expect(requestAccess(validBody, deps)).rejects.toThrow("CITY_INVALID");
    expect(deps.deleteAuthUser).toHaveBeenCalledWith("auth-1");
  });

  it("returns an idempotent request without creating another identity", async () => {
    const deps = dependencies();
    deps.findBySubmissionKey.mockResolvedValue("request-existing");

    await expect(requestAccess(validBody, deps)).resolves.toEqual({ requestId: "request-existing" });
    expect(deps.createAuthUser).not.toHaveBeenCalled();
    expect(deps.submitRequest).not.toHaveBeenCalled();
  });

  it("rejects weak passwords before touching Auth", async () => {
    const deps = dependencies();

    await expect(requestAccess({ ...validBody, password: "short" }, deps)).rejects.toThrow("PASSWORD_INVALID");
    expect(deps.findBySubmissionKey).not.toHaveBeenCalled();
    expect(deps.createAuthUser).not.toHaveBeenCalled();
  });
});
