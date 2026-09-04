import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogRealtimeEntity = "city" | "category" | "product" | "template";

export interface CatalogRealtimeEvent {
  entity: CatalogRealtimeEntity;
  id: string;
  deleted: boolean;
}

type RealtimePayload = {
  eventType?: string;
  new?: Record<string, unknown>;
  old?: Record<string, unknown>;
};

const tableContracts: Record<string, { entity: CatalogRealtimeEntity; idField: string; base: boolean }> = {
  cities: { entity: "city", idField: "id", base: true },
  categories: { entity: "category", idField: "id", base: true },
  category_translations: { entity: "category", idField: "category_id", base: false },
  products: { entity: "product", idField: "id", base: true },
  product_translations: { entity: "product", idField: "product_id", base: false },
  product_prices: { entity: "product", idField: "product_id", base: false },
  product_media: { entity: "product", idField: "product_id", base: false },
  description_templates: { entity: "template", idField: "id", base: true },
  description_template_translations: { entity: "template", idField: "template_id", base: false },
};

export function subscribeToCatalog(
  client: SupabaseClient,
  onEvent: (event: CatalogRealtimeEvent) => void,
  coalesceMs = 100,
  onStatus?: (status: string) => void,
): () => void {
  const pending = new Map<string, CatalogRealtimeEvent>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const events = [...pending.values()];
    pending.clear();
    events.forEach((event) => onEvent(event));
  };

  const enqueue = (table: string, payload: RealtimePayload) => {
    const contract = tableContracts[table];
    if (!contract) return;
    const row = payload.new && Object.keys(payload.new).length ? payload.new : payload.old;
    const id = String(row?.[contract.idField] || "");
    if (!id) return;
    const event: CatalogRealtimeEvent = {
      entity: contract.entity,
      id,
      deleted: contract.base && payload.eventType === "DELETE",
    };
    const key = `${event.entity}:${event.id}`;
    const previous = pending.get(key);
    pending.set(key, previous?.deleted ? previous : event);
    if (timer === null) timer = setTimeout(flush, coalesceMs);
  };

  let channel = client.channel("catalog:entities");
  Object.keys(tableContracts).forEach((table) => {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) => enqueue(table, payload as unknown as RealtimePayload),
    );
  });
  channel.subscribe((status) => onStatus?.(status));

  return () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending.clear();
    void client.removeChannel(channel);
  };
}
