import { describe, expect, it, vi } from "vitest";

import { createUsersRepository } from "./usersRepository";

describe("Supabase users repository", () => {
  it("loads users through the permission-aware RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ id: "user-1", display_name: "Ana", username: "ana", role: "commercial", status: "active", city_ids: ["city-1"], product_permissions: { clone_category: true }, manage_requests: true }], error: null });
    const repository = createUsersRepository({ rpc } as never);

    const users = await repository.list();

    expect(rpc).toHaveBeenCalledWith("list_users_for_management");
    expect(users[0]).toMatchObject({ name: "Ana", role: "COMERCIAL", allowedCityIds: ["city-1"], permissions: { product: { cloneCategory: true }, accessRequests: { manageAssignedCities: true } } });
  });

  it("uses the protected function for saves and deletes", async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { profileId: "user-1" }, error: null });
    const repository = createUsersRepository({ functions: { invoke } } as never);
    await repository.save({ name: "Ana", username: "ana", role: "COMERCIAL", allowedCityIds: ["city-1"], active: true });
    await repository.remove("user-1");
    expect(invoke).toHaveBeenNthCalledWith(1, "manage-user", expect.objectContaining({ body: expect.objectContaining({ action: "save" }) }));
    expect(invoke).toHaveBeenNthCalledWith(2, "manage-user", { body: { action: "delete", profileId: "user-1" } });
  });
});
