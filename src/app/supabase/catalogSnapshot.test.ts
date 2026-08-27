import { describe, expect, it, vi } from "vitest";
import { fetchCatalogSnapshot } from "./catalogSnapshot";

describe("Supabase complete catalog snapshot", () => {
  it("loads every category page without one giant backend response", async () => {
    const fetchCatalogPage = vi.fn()
      .mockResolvedValueOnce({ products: [{ id: "p1" }], nextCursor: { position: 0, id: "p1" } })
      .mockResolvedValueOnce({ products: [{ id: "p2" }], nextCursor: null });
    const snapshot = await fetchCatalogSnapshot({
      fetchCatalogMetadata: vi.fn().mockResolvedValue({ cities: [{ id: "c1", name: "Nobre", order: 0 }], categories: [{ id: "cat1", cityId: "c1", title: "Produtos", icon: "Box", order: 0 }] }),
      fetchCatalogPage,
      fetchDescriptionTemplates: vi.fn().mockResolvedValue([]),
    } as never, "pt");
    expect(snapshot.products.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(fetchCatalogPage).toHaveBeenCalledTimes(2);
  });
});
