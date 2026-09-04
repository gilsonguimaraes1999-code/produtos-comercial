import { describe, expect, it, vi } from "vitest";

import { createCatalogEntityRepository } from "./catalogEntityRepository";

function singleQuery(data: unknown) {
  const query: Record<string, unknown> = {};
  query['select'] = vi.fn(() => query);
  query['eq'] = vi.fn(() => query);
  query['maybeSingle'] = vi.fn().mockResolvedValue({ data, error: null });
  return query;
}

describe("granular catalog entity repository", () => {
  it("fetches and maps only the requested product", async () => {
    const query = singleQuery({
      id: "p1",
      category_id: "cat1",
      position: 2,
      version: 9,
      product_translations: [{ language: "pt", name: "Produto", description_html: "", is_source: true }],
      product_prices: [{ currency: "BRL", amount: "25.50" }],
      product_media: [],
    });
    const from = vi.fn(() => query);
    const repository = createCatalogEntityRepository({
      from,
      storage: { from: vi.fn(() => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: path } }) })) },
    } as never);

    const product = await repository.fetchProduct("p1", "pt", "BRL");

    expect(from).toHaveBeenCalledWith("products");
    expect(query['eq']).toHaveBeenCalledWith("id", "p1");
    expect(product).toMatchObject({ id: "p1", name: "Produto", amount: 25.5, version: 9 });
  });

  it("returns null when a requested entity was removed", async () => {
    const query = singleQuery(null);
    const repository = createCatalogEntityRepository({ from: vi.fn(() => query) } as never);

    await expect(repository.fetchCity("missing", "pt")).resolves.toBeNull();
  });

  it("maps one description template with its confirmed version", async () => {
    const query = singleQuery({
      id: "tpl1",
      category_id: "cat1",
      name: "Padrão",
      position: 0,
      is_active: true,
      version: 4,
      description_template_translations: [{ language: "pt", html: "<p>PT</p>" }],
    });
    const repository = createCatalogEntityRepository({ from: vi.fn(() => query) } as never);

    await expect(repository.fetchDescriptionTemplate("tpl1")).resolves.toMatchObject({
      id: "tpl1",
      htmlBR: "<p>PT</p>",
      version: 4,
    });
  });
});
