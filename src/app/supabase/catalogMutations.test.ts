import { describe, expect, it, vi } from "vitest";

import { createCatalogMutations } from "./catalogMutations";

describe("Supabase catalog mutations", () => {
  it("updates only the selected language when editing a product", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "product-1", error: null });
    const mutations = createCatalogMutations({ rpc } as never);

    await mutations.saveProduct({
      id: "product-1",
      categoryId: "category-1",
      name: "Nome corrigido",
      descriptionHtml: "<p>Descrição corrigida</p>",
      sourceLanguage: "pt",
      currency: "BRL",
      prices: { BRL: 100.25 },
      images: [],
    });

    expect(rpc).toHaveBeenCalledWith("save_product", expect.objectContaining({
      target_product_id: "product-1",
      translation_payload: {
        language: "pt",
        name: "Nome corrigido",
        description_html: "<p>Descrição corrigida</p>",
        translate_missing: false,
      },
    }));
  });

  it("requests missing translations only when creating a product", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "new-product", error: null });
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

    expect(rpc).toHaveBeenCalledWith("save_product", expect.objectContaining({
      target_product_id: null,
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
});
