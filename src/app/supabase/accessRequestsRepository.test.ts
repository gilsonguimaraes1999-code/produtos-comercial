import { describe, expect, it, vi } from "vitest";

import { createAccessRequestsRepository } from "./accessRequestsRepository";

describe("Supabase access requests repository", () => {
  it("submits only identity and selected city ids, never the requested password", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { requestId: "request-1" }, error: null });
    const repository = createAccessRequestsRepository({ functions: { invoke } } as never);
    await repository.create({ name: "Ana", username: "ana", password: "must-not-leave-browser", cityName: "Nobre", requestedCityNames: ["Nobre"] }, ["city-1"]);
    expect(invoke).toHaveBeenCalledWith("request-access", { body: { displayName: "Ana", username: "ana", cityIds: ["city-1"] } });
  });

  it("reviews requests through the protected function", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const repository = createAccessRequestsRepository({ functions: { invoke } } as never);
    await repository.approve("request-1", ["city-1"]);
    await repository.reject("request-2", "Dados inválidos");
    expect(invoke).toHaveBeenNthCalledWith(1, "review-access-request", { body: { requestId: "request-1", decision: "approved", cityIds: ["city-1"] } });
    expect(invoke).toHaveBeenNthCalledWith(2, "review-access-request", { body: { requestId: "request-2", decision: "rejected", reason: "Dados inválidos" } });
  });
});
