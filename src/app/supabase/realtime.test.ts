import { describe, expect, it, vi } from "vitest";

import { subscribeToCatalog } from "./realtime";

describe("Supabase catalog realtime", () => {
  it("invalidates only the active catalog scope and metadata", async () => {
    const handlers: Array<(payload: unknown) => void> = [];
    const channel = {
      on: vi.fn((_event, _config, handler) => { handlers.push(handler); return channel; }),
      subscribe: vi.fn(() => channel),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const queryClient = { invalidateQueries: vi.fn() };

    const unsubscribe = subscribeToCatalog(client as never, queryClient as never, {
      cityId: "city-1",
      categoryId: "category-1",
      language: "pt",
      currency: "BRL",
    });
    handlers[0]({ table: "products" });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["catalog-products", "city-1", "category-1", "pt", "BRL"],
    });
    unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
