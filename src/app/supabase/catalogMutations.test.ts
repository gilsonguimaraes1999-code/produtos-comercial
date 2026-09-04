import { describe, expect, it, vi } from "vitest";

import { CatalogConflictError, createCatalogMutations } from "./catalogMutations";

describe("Supabase catalog mutations", () => {
  it("updates only the selected language when editing a product", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "product-1", version: 8 }, error: null });
    const mutations = createCatalogMutations({ rpc } as never);

    await mutations.saveProduct({
      id: "product-1",
      version: 7,
      categoryId: "category-1",
      name: "Nome corrigido",
      descriptionHtml: "<p>Descrição corrigida</p>",
      sourceLanguage: "pt",
      currency: "BRL",
      prices: { BRL: 100.25 },
      images: [],
    });

    expect(rpc).toHaveBeenCalledWith("save_product_v2", expect.objectContaining({
      target_product_id: "product-1",
      expected_version: 7,
      translation_payload: {
        language: "pt",
        name: "Nome corrigido",
        description_html: "<p>Descrição corrigida</p>",
        translate_missing: false,
      },
    }));
  });

  it("requests missing translations only when creating a product", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "new-product", version: 1 }, error: null });
    const mutations = createCatalogMutations({ rpc } as never);

    await mutations.saveProduct({
      categoryId: "category-1",
      name: "Produto novo",
      sourceLanguage: "pt",
      autoTranslate: true,
      currency: "BRL",
      prices: { BRL: 50 },
      images: [],
    });

    expect(rpc).toHaveBeenCalledWith("save_product_v2", expect.objectContaining({
      target_product_id: null,
      expected_version: null,
      translation_payload: expect.objectContaining({ translate_missing: true }),
    }));
  });

  it("keeps category cloning separate from product cloning", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "clone-id", error: null });
    const mutations = createCatalogMutations({ rpc } as never);

    await mutations.cloneCategory({ categoryId: "category-1", targetCityId: "city-2" });

    expect(rpc).toHaveBeenCalledWith("clone_category", {
      source_category_id: "category-1",
      target_city_id: "city-2",
    });
    expect(rpc).not.toHaveBeenCalledWith("clone_product", expect.anything());
  });

  it("returns the server-confirmed product id and version", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: "product-1", version: 8 }, error: null });
    const mutations = createCatalogMutations({ rpc } as never);

    const result = await mutations.saveProduct({
      id: "product-1",
      version: 7,
      categoryId: "category-1",
      name: "Produto",
      sourceLanguage: "pt",
      currency: "BRL",
      prices: { BRL: 10 },
      images: [],
    });

    expect(result).toEqual({ id: "product-1", version: 8 });
  });

  it("preserves entity conflicts as a typed error", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "EDIT_CONFLICT", code: "40001" } });
    const mutations = createCatalogMutations({ rpc } as never);

    await expect(mutations.saveCity({ id: "city-1", version: 4, name: "Cidade" }))
      .rejects.toEqual(expect.objectContaining({ name: "CatalogConflictError", kind: "entity", code: "EDIT_CONFLICT" }));
  });

  it("preserves order conflicts and sends the opened order", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "ORDER_CONFLICT", code: "40001" } });
    const mutations = createCatalogMutations({ rpc } as never);

    const promise = mutations.reorderProducts("category-1", ["p2", "p1"], ["p1", "p2"]);
    await expect(promise).rejects.toBeInstanceOf(CatalogConflictError);
    await expect(promise).rejects.toMatchObject({ kind: "order", code: "ORDER_CONFLICT" });
    expect(rpc).toHaveBeenCalledWith("reorder_products_v2", {
      target_category_id: "category-1",
      requested_order: ["p2", "p1"],
      expected_order: ["p1", "p2"],
    });
  });
});
