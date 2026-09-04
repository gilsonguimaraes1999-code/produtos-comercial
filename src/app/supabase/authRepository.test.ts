import { describe, expect, it, vi } from "vitest";

import type { AuthUser } from "../types";
import {
  createAuthRepository,
  normalizeUsername,
  usernameToTechnicalEmail,
} from "./authRepository";

const owner: AuthUser = {
  id: "profile-owner",
  name: "Owner",
  username: "owner",
  role: "OWNER",
  status: "Ativo",
};

describe("Supabase username authentication", () => {
  it("normalizes usernames and maps them to a hidden technical email", () => {
    expect(normalizeUsername("  Owner ")).toBe("owner");
    expect(usernameToTechnicalEmail("Owner")).toBe(
      "owner@users.comercial-produtos.app",
    );
    expect(usernameToTechnicalEmail("gostoSãoLindo")).toBe(
      "gostosc3a3olindo@users.comercial-produtos.app",
    );
  });

  it("signs in with the technical email without exposing it to the UI", async () => {
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: {
        session: { access_token: "access-token" },
        user: { id: "auth-owner" },
      },
      error: null,
    });
    const client = { auth: { signInWithPassword } };
    const loadUser = vi.fn().mockResolvedValue(owner);
    const repository = createAuthRepository(client as never, loadUser);

    await expect(repository.login(" Owner ", "secret-value")).resolves.toEqual({
      token: "access-token",
      user: owner,
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "owner@users.comercial-produtos.app",
      password: "secret-value",
    });
  });
});
