import { describe, expect, it, vi } from "vitest";

import { createTranslationRepository, missingTargetLanguages } from "./translationRepository";

describe("Supabase translation jobs", () => {
  it("queues exactly the two missing languages on creation", () => {
    expect(missingTargetLanguages("pt", ["pt"])).toEqual(["en", "es"]);
    expect(missingTargetLanguages("en", ["pt", "en"])).toEqual(["es"]);
  });

  it("does not queue translations for an ordinary edit", async () => {
    const invoke = vi.fn();
    const repository = createTranslationRepository({ functions: { invoke } } as never);

    await repository.processCreationJobs([], false);

    expect(invoke).not.toHaveBeenCalled();
  });

  it("processes explicit queued jobs through the protected Edge Function", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
    const repository = createTranslationRepository({ functions: { invoke } } as never);

    await repository.processCreationJobs(["job-1", "job-2"], true);

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledWith("process-translation", { body: { jobId: "job-1" } });
  });
});
