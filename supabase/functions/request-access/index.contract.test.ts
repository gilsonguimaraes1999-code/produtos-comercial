import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("request-access production wiring", () => {
  it("delegates HTTP handling and sends the requested password only to Auth", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/request-access/index.ts"), "utf8");

    expect(source).toContain("handleRequestAccessHttp");
    expect(source).toContain("password,");
    expect(source).toContain("submit_access_request_v3");
    expect(source).not.toMatch(/console\.(?:log|error)\([^)]*body/);
  });
});
