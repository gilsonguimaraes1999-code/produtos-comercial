import { describe, expect, it } from "vitest";

import { normalizeSnapshot } from "../normalize-snapshot.mjs";

const fixture = {
  version: 1,
  tables: {
    Cities: [{ id: "legacy-city", name: "Nobre", order: "2" }],
    Categories: [{ id: "legacy-category", cityId: "legacy-city", titleBR: "Modificações", titleEN: "Modifications", titleES: "Modificaciones", icon: "Hammer", order: "1" }],
    Products: [{ id: "legacy-product", categoryId: "legacy-category", nameBR: "Produto", nameEN: "Product", nameES: "Producto", amountBRL: "143,25", amountUSD: "20.50", order: "3" }],
    ProductImages: [{ id: "legacy-image", productId: "legacy-product", url: "https://img.example/item.png", deleteUrl: "secret-delete", order: "0" }],
    Users: [{ id: "legacy-user", name: "Owner", username: "Owner", passwordHash: "must-not-leak", passwordSalt: "must-not-leak", role: "OWNER", allowedCityIds: '["legacy-city"]', permissions: '{"product":{"cloneCategory":true}}' }],
    Meta: [{ key: "revision", value: "42" }],
  },
};

describe("legacy snapshot normalization", () => {
  it("is deterministic and preserves order, translations, cents and permissions", () => {
    const first = normalizeSnapshot(fixture);
    const second = normalizeSnapshot(fixture);

    expect(first).toEqual(second);
    expect(first.cities[0]).toMatchObject({ name: "Nobre", position: 2 });
    expect(first.categoryTranslations.map((row) => row.title)).toEqual(["Modificações", "Modifications", "Modificaciones"]);
    expect(first.productPrices).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "BRL", amount: "143.25" }),
      expect.objectContaining({ currency: "USD", amount: "20.50" }),
    ]));
    expect(first.productMedia[0]).not.toHaveProperty("deleteUrl");
    expect(first.profiles[0]).not.toHaveProperty("passwordHash");
    expect(first.profiles[0].permissions.product.cloneCategory).toBe(true);
    expect(first.userCities[0].cityId).toBe(first.cities[0].id);
  });

  it("normalizes the public catalog format with nested translations, prices and media", () => {
    const currentCatalog = {
      catalog: {
        cities: [{ id: "city-current", name: "Grande", order: 0 }],
        categories: [{
          id: "category-current", cityId: "city-current", title: "Mansões",
          translations: { pt: "Mansões", en: "Mansions", es: "Mansiones" }, order: 0,
        }],
        products: [{
          id: "product-current", categoryId: "category-current", name: "Mansão 01",
          translations: { pt: "Mansão 01", en: "Mansion 01", es: "Mansión 01" },
          descriptionTranslations: { pt: "Descrição", en: "Description", es: "Descripción" },
          prices: { BRL: 6000, USD: 1000, GBP: 900, EUR: 950 }, order: 1,
          images: [
            { id: "media-current", url: "https://img.example/mansion.png", order: 0 },
            { id: "media-drive", url: "https://drive.google.com/file/d/drive-video-id/preview", order: 1 },
          ],
        }],
      },
    };

    const normalized = normalizeSnapshot(currentCatalog);

    expect(normalized.categoryTranslations.map((row) => row.title)).toEqual(["Mansões", "Mansions", "Mansiones"]);
    expect(normalized.productTranslations.map((row) => [row.language, row.name, row.descriptionHtml])).toEqual([
      ["pt", "Mansão 01", "Descrição"],
      ["en", "Mansion 01", "Description"],
      ["es", "Mansión 01", "Descripción"],
    ]);
    expect(normalized.productPrices).toEqual(expect.arrayContaining([
      expect.objectContaining({ currency: "BRL", amount: "6000.00" }),
      expect.objectContaining({ currency: "EUR", amount: "950.00" }),
    ]));
    expect(normalized.productMedia).toHaveLength(2);
    expect(normalized.productMedia[0]).toMatchObject({ url: "https://img.example/mansion.png", productId: normalized.products[0].id });
    expect(normalized.productMedia[1]).toMatchObject({
      mediaType: "video",
      videoProvider: "drive",
      thumbnailUrl: "https://lh3.googleusercontent.com/d/drive-video-id=w480",
    });
  });
});
