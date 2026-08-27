import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabaseBrowserEnv, hasSupabaseBrowserEnv } from "./env";

describe("getSupabaseBrowserEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a stable error when Supabase browser credentials are missing", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");

    expect(() => getSupabaseBrowserEnv()).toThrow("SUPABASE_NOT_CONFIGURED");
    expect(hasSupabaseBrowserEnv()).toBe(false);
  });

  it("detects when both public browser credentials are configured", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "public-anon-key");

    expect(hasSupabaseBrowserEnv()).toBe(true);
  });
});
