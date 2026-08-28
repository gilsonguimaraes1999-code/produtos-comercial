import { describe, expect, it, vi } from "vitest";

import { createAccessRequestsRepository } from "./accessRequestsRepository";

describe("Supabase access requests repository", () => {
  it("submits a hashed-server tracking secret contract and returns a browser-only receipt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "request-1", error: null });
    const repository = createAccessRequestsRepository({ rpc } as never);

    const receipt = await repository.create({ name: " Ana ", username: " ANA ", password: "must-not-leave-browser", cityName: "Nobre", requestedCityNames: ["Nobre"] }, ["city-1"]);

    expect(receipt.requestId).toBe("request-1");
    expect(receipt.submissionKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(receipt.trackingSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(rpc).toHaveBeenCalledWith("submit_access_request_v2", {
      request_display_name: "Ana",
      request_username: "ANA",
      requested_city_ids: ["city-1"],
      tracking_secret: receipt.trackingSecret,
      request_submission_key: receipt.submissionKey,
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("must-not-leave-browser");
  });

  it("queries only the request identified by its secret receipt", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ status: "approved", reviewed_at: "2026-08-27T12:00:00Z", rejection_reason: null }], error: null });
    const repository = createAccessRequestsRepository({ rpc } as never);
    const result = await repository.status({ requestId: "request-1", trackingSecret: "secret", submissionKey: "submission" });
    expect(rpc).toHaveBeenCalledWith("get_access_request_status", { target_request_id: "request-1", tracking_secret: "secret" });
    expect(result).toEqual({ status: "APROVADO", reviewedAt: "2026-08-27T12:00:00Z" });
  });

  it("reuses one review key for the action and returns changed records", async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: { ok: true, request: { id: "request-1", status: "approved" }, user: { id: "user-1", status: "pending_activation" }, activation: { code: "ABC" } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, request: { id: "request-2", status: "rejected" } }, error: null });
    const repository = createAccessRequestsRepository({ functions: { invoke } } as never);
    const approved = await repository.approve("request-1", ["city-1"], "review-1");
    const rejected = await repository.reject("request-2", "Dados inválidos", "review-2");
    expect(invoke).toHaveBeenNthCalledWith(1, "review-access-request", { body: { requestId: "request-1", decision: "approved", cityIds: ["city-1"], reviewKey: "review-1" } });
    expect(invoke).toHaveBeenNthCalledWith(2, "review-access-request", { body: { requestId: "request-2", decision: "rejected", reason: "Dados inválidos", reviewKey: "review-2" } });
    expect(approved.request.status).toBe("APROVADO");
    expect(approved.user?.id).toBe("user-1");
    expect(rejected.request.status).toBe("REPROVADO");
  });

  it('retains the generated review key after an uncertain failure and clears it after success', async () => {
    const invoke = vi.fn()
      .mockRejectedValueOnce(new Error('NETWORK_ERROR'))
      .mockResolvedValueOnce({ data: { ok: true, request: { id: 'request-1', status: 'approved' } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, request: { id: 'request-1', status: 'approved' } }, error: null });
    const repository = createAccessRequestsRepository({ functions: { invoke } } as never);

    await expect(repository.approve('request-1', ['city-1'])).rejects.toThrow('NETWORK_ERROR');
    await repository.approve('request-1', ['city-1']);
    await repository.approve('request-1', ['city-1']);

    const firstKey = invoke.mock.calls[0]?.[1].body.reviewKey;
    const retryKey = invoke.mock.calls[1]?.[1].body.reviewKey;
    const nextActionKey = invoke.mock.calls[2]?.[1].body.reviewKey;
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(retryKey).toBe(firstKey);
    expect(nextActionKey).not.toBe(firstKey);
  });

  it('reads a definitive conflict code from the Edge Function response and clears the review key', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'REQUEST_NOT_PENDING' }), { status: 409 }) } })
      .mockResolvedValueOnce({ data: { ok: true, request: { id: 'request-1', status: 'approved' } }, error: null });
    const repository = createAccessRequestsRepository({ functions: { invoke } } as never);

    await expect(repository.approve('request-1', ['city-1'])).rejects.toThrow('REQUEST_NOT_PENDING');
    await repository.approve('request-1', ['city-1']);

    expect(invoke.mock.calls[1]?.[1].body.reviewKey).not.toBe(invoke.mock.calls[0]?.[1].body.reviewKey);
  });
});
