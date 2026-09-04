import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202609030001_password_based_access_requests.sql",
);

describe("password-based access request migration", () => {
  it("stores a pending auth identity without adding a password column", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("pending_auth_user_id uuid");
    expect(sql).not.toMatch(/add column[^;]*password/i);
  });

  it("defines the v3 submit and review contracts", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("submit_access_request_v3");
    expect(sql).toContain("review_access_request_v3");
    expect(sql).toContain("'active'");
  });
});
