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

  it("limits simultaneous category reads so authenticated RLS queries do not time out", async () => {
    let activeReads = 0;
    let maximumActiveReads = 0;
    const categories = Array.from({ length: 12 }, (_, index) => ({
      id: `cat-${index + 1}`,
      cityId: "city-1",
      title: `Categoria ${index + 1}`,
      icon: "Box",
      order: index,
    }));
    const fetchCatalogPage = vi.fn(async ({ categoryId }: { categoryId: string }) => {
      activeReads += 1;
      maximumActiveReads = Math.max(maximumActiveReads, activeReads);
      await Promise.resolve();
      activeReads -= 1;
      return { products: [{ id: `product-${categoryId}` }], nextCursor: null };
    });

    const snapshot = await fetchCatalogSnapshot({
      fetchCatalogMetadata: vi.fn().mockResolvedValue({ cities: [{ id: "city-1", name: "Nobre", order: 0 }], categories }),
      fetchCatalogPage,
      fetchDescriptionTemplates: vi.fn().mockResolvedValue([]),
    } as never, "pt");

    expect(maximumActiveReads).toBeLessThanOrEqual(4);
    expect(snapshot.products).toHaveLength(12);
  });

  it("retries one product page after a transient Supabase statement timeout", async () => {
    const fetchCatalogPage = vi.fn()
      .mockRejectedValueOnce(new Error("canceling statement due to statement timeout"))
      .mockResolvedValueOnce({ products: [{ id: "product-1" }], nextCursor: null });

    const snapshot = await fetchCatalogSnapshot({
      fetchCatalogMetadata: vi.fn().mockResolvedValue({
        cities: [{ id: "city-1", name: "Nobre", order: 0 }],
        categories: [{ id: "cat-1", cityId: "city-1", title: "Produtos", icon: "Box", order: 0 }],
      }),
      fetchCatalogPage,
      fetchDescriptionTemplates: vi.fn().mockResolvedValue([]),
    } as never, "pt");

    expect(snapshot.products.map((product) => product.id)).toEqual(["product-1"]);
    expect(fetchCatalogPage).toHaveBeenCalledTimes(2);
  });
});
