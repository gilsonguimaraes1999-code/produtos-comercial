import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { ContentLanguage } from "../types";

const languages: ContentLanguage[] = ["pt", "en", "es"];

export function missingTargetLanguages(
  sourceLanguage: ContentLanguage,
  existingLanguages: ContentLanguage[],
): ContentLanguage[] {
  const existing = new Set(existingLanguages);
  existing.add(sourceLanguage);
  return languages.filter((language) => !existing.has(language));
}

export function createTranslationRepository(client: SupabaseClient) {
  return {
    async processCreationJobs(jobIds: string[], isCreation: boolean): Promise<void> {
      if (!isCreation || !jobIds.length) return;
      for (const jobId of jobIds) {
        const result = await client.functions.invoke("process-translation", {
          body: { jobId },
        });
        if (result.error) throw result.error;
      }
    },

    async retryJob(jobId: string): Promise<void> {
      const result = await client.functions.invoke("process-translation", {
        body: { jobId, retry: true },
      });
      if (result.error) throw result.error;
    },
  };
}

export function getTranslationRepository() {
  return createTranslationRepository(getSupabaseBrowserClient());
}
