import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/functions/manage-user/index.ts"), "utf8");

describe("manage-user password contract", () => {
  it("creates new users with the supplied password and an active profile", () => {
    expect(source).toContain("password: requestedPassword");
    expect(source).toContain('status: "active"');
    expect(source).not.toContain("randomSecret");
    expect(source).not.toContain("issueActivationCode");
    expect(source).not.toContain("pending_activation");
  });

  it("requires a valid password for new accounts", () => {
    expect(source).toContain('requestedPassword.length < 8');
    expect(source).toContain('throw new Error("PASSWORD_TOO_SHORT")');
  });
});
