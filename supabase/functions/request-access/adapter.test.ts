import { describe, expect, it, vi } from "vitest";

import { handleRequestAccessHttp } from "./adapter";

function runtime() {
  return {
    findBySubmissionKey: vi.fn().mockResolvedValue(null),
    createAuthUser: vi.fn().mockResolvedValue("auth-1"),
    submitRequest: vi.fn().mockResolvedValue("request-1"),
    deleteAuthUser: vi.fn().mockResolvedValue(undefined),
  };
}

describe("request access HTTP adapter", () => {
  it("returns the created request without exposing credentials", async () => {
    const deps = runtime();
    const response = await handleRequestAccessHttp(
      new Request("http://localhost/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Ana Silva",
          username: "ana",
          password: "safe-password",
          cityIds: ["city-1"],
          trackingSecret: "a".repeat(64),
          submissionKey: "submission-1",
        }),
      }),
      () => deps,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ requestId: "request-1" });
  });

  it("maps password validation to a stable public error", async () => {
    const response = await handleRequestAccessHttp(
      new Request("http://localhost/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: "Ana Silva",
          username: "ana",
          password: "short",
          cityIds: ["city-1"],
          trackingSecret: "a".repeat(64),
          submissionKey: "submission-1",
        }),
      }),
      () => runtime(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "PASSWORD_INVALID" });
  });
});
