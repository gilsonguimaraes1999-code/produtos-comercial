import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/migration/import-snapshot.mjs", "utf8");

describe("snapshot user import", () => {
  it("does not generate activation codes", () => {
    expect(source).not.toContain("activation_codes");
    expect(source).not.toContain("activationCode");
    expect(source).not.toContain("pending_activation");
  });

  it("activates the owner with the supplied migration password", () => {
    expect(source).toContain('requiredEnv("MIGRATION_OWNER_PASSWORD")');
    expect(source).toContain('profile.role === "owner" ? "active" : "disabled"');
  });
});
