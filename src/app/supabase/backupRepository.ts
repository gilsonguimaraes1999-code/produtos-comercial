import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { BackupRecord, BackupResult } from "../types";

function assertFunction(result: { data?: { error?: string } | null; error?: { message?: string } | null }) {
  if (result.error || result.data?.error) throw new Error(result.data?.error || result.error?.message || "BACKUP_OPERATION_FAILED");
}

export function createBackupRepository(client: SupabaseClient) {
  return {
    async create(): Promise<BackupResult> {
      const result = await client.functions.invoke("create-backup", { body: {} });
      assertFunction(result);
      return result.data?.backup as BackupResult;
    },
    async list(): Promise<BackupRecord[]> {
      const result = await client.functions.invoke("list-backups", { body: {} });
      assertFunction(result);
      return (result.data?.backups || []) as BackupRecord[];
    },
    async import(snapshot: unknown): Promise<void> {
      const result = await client.functions.invoke("import-backup", { body: { snapshot } });
      assertFunction(result);
    },
  };
}

export function getBackupRepository() { return createBackupRepository(getSupabaseBrowserClient()); }
