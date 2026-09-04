import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("review-access-request production wiring", () => {
  it("uses the reserved auth identity and v3 review without activation codes", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/review-access-request/index.ts"), "utf8");

    expect(source).toContain("pending_auth_user_id");
    expect(source).toContain("review_access_request_v3");
    expect(source).not.toContain("issueActivationCode");
    expect(source).not.toContain("randomSecret");
  });
});
