import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { subscribeToCatalog } from "./realtime";

describe("Supabase catalog realtime", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const handlers: Record<string, (payload: Record<string, unknown>) => void> = {};
    const channel = {
      on: vi.fn((_event, config: { table: string }, handler: (payload: Record<string, unknown>) => void) => {
        handlers[config.table] = handler;
        return channel;
      }),
      subscribe: vi.fn(() => channel),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const onEvent = vi.fn();
    const unsubscribe = subscribeToCatalog(client as never, onEvent);
    return { handlers, client, channel, onEvent, unsubscribe };
  }

  it("coalesces price, translation and media changes for one product", async () => {
    const { handlers, onEvent } = setup();
    handlers['product_prices']?.({ eventType: "UPDATE", new: { product_id: "p1" }, old: {} });
    handlers['product_translations']?.({ eventType: "UPDATE", new: { product_id: "p1" }, old: {} });
    handlers['product_media']?.({ eventType: "INSERT", new: { product_id: "p1" }, old: {} });

    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ entity: "product", id: "p1", deleted: false });
  });

  it("normalizes a base-row deletion and reads the id from old", async () => {
    const { handlers, onEvent } = setup();
    handlers['products']?.({ eventType: "DELETE", new: {}, old: { id: "p1" } });

    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).toHaveBeenCalledWith({ entity: "product", id: "p1", deleted: true });
  });

  it("keeps simultaneous changes to different entities independent", async () => {
    const { handlers, onEvent } = setup();
    handlers['category_translations']?.({ eventType: "UPDATE", new: { category_id: "cat1" }, old: {} });
    handlers['description_template_translations']?.({ eventType: "UPDATE", new: { template_id: "tpl1" }, old: {} });

    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith({ entity: "category", id: "cat1", deleted: false });
    expect(onEvent).toHaveBeenCalledWith({ entity: "template", id: "tpl1", deleted: false });
  });

  it("clears pending delivery when unsubscribed", async () => {
    const { handlers, client, channel, onEvent, unsubscribe } = setup();
    handlers['cities']?.({ eventType: "UPDATE", new: { id: "city1" }, old: {} });
    unsubscribe();
    await vi.advanceTimersByTimeAsync(100);

    expect(onEvent).not.toHaveBeenCalled();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
