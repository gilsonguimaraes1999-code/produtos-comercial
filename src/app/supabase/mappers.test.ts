import { describe, expect, it } from "vitest";

import {
  mapCategoryRow,
  mapCityRow,
  mapProductRow,
} from "./mappers";

describe("Supabase catalog mappers", () => {
  it("preserves positions and falls back to the source translation", () => {
    expect(mapCityRow({ id: "city-1", name: "Nobre", position: 4, version: 6 })).toMatchObject({
      id: "city-1",
      name: "Nobre",
      order: 4,
      version: 6,
    });

    const category = mapCategoryRow({
      id: "category-1",
      city_id: "city-1",
      icon: "Building2",
      position: 7,
      version: 3,
      category_translations: [
        { language: "pt", title: "Mansões", is_source: true },
        { language: "en", title: "Mansions", is_source: false },
      ],
    }, "es");

    expect(category.title).toBe("Mansões");
    expect(category.order).toBe(7);
    expect(category.version).toBe(3);
    expect(category.translations).toEqual({ pt: "Mansões", en: "Mansions" });
  });

  it("maps numeric price strings and ordered media without losing cents", () => {
    const product = mapProductRow({
      id: "product-1",
      category_id: "category-1",
      position: 3,
      version: 11,
      sold: false,
      product_translations: [
        { language: "pt", name: "Produto", description_html: "<p>BR</p>", is_source: true },
      ],
      product_prices: [
        { currency: "BRL", amount: "60000.25" },
        { currency: "USD", amount: "123.45" },
      ],
      product_media: [
        { id: "media-2", media_type: "image", public_url: "https://cdn/2.webp", position: 2 },
        { id: "media-1", media_type: "image", public_url: "https://cdn/1.webp", position: 1 },
      ],
    }, "es", "BRL");

    expect(product.amount).toBe(60000.25);
    expect(product.prices).toEqual({ BRL: 60000.25, USD: 123.45 });
    expect(product.images.map((image) => image.id)).toEqual(["media-1", "media-2"]);
    expect(product.order).toBe(3);
    expect(product.version).toBe(11);
  });

  it("defaults legacy rows to version one", () => {
    expect(mapCityRow({ id: "city-1", name: "Nobre", position: 0 }).version).toBe(1);
  });
});
