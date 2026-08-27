import { describe, expect, it, vi } from "vitest";

import { createCatalogRepository } from "./catalogRepository";

function queryResult(data: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "or", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error: null }));
  return query;
}

describe("Supabase catalog repository", () => {
  it("loads ordered metadata independently from product pages", async () => {
    const citiesQuery = queryResult([{ id: "city-1", name: "Nobre", position: 0 }]);
    const categoriesQuery = queryResult([{
      id: "category-1",
      city_id: "city-1",
      icon: "Box",
      position: 0,
      category_translations: [{ language: "pt", title: "Produtos", is_source: true }],
    }]);
    const from = vi.fn((table: string) => table === "cities" ? citiesQuery : categoriesQuery);
    const repository = createCatalogRepository({ from } as never);

    const metadata = await repository.fetchCatalogMetadata("pt");

    expect(metadata.cities.map((city) => city.name)).toEqual(["Nobre"]);
    expect(metadata.categories.map((category) => category.title)).toEqual(["Produtos"]);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it("returns a stable position/id cursor and only the requested page", async () => {
    const rows = [0, 1, 2].map((position) => ({
      id: `00000000-0000-0000-0000-00000000000${position}`,
      category_id: "category-1",
      position,
      product_translations: [{ language: "pt", name: `Produto ${position}`, is_source: true }],
      product_prices: [{ currency: "BRL", amount: "10.00" }],
      product_media: [],
    }));
    const productsQuery = queryResult(rows);
    const repository = createCatalogRepository({
      from: vi.fn(() => productsQuery),
      storage: { from: vi.fn(() => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: path } }) })) },
    } as never);

    const page = await repository.fetchCatalogPage({
      cityId: "city-1",
      categoryId: "category-1",
      language: "pt",
      currency: "BRL",
      limit: 2,
    });

    expect(page.products.map((product) => product.name)).toEqual(["Produto 0", "Produto 1"]);
    expect(page.nextCursor).toEqual({ position: 1, id: rows[1].id });
    expect(productsQuery.limit).toHaveBeenCalledWith(3);
  });
});
