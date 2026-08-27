import { describe, expect, it } from "vitest";

import { compareMigration } from "../verify-migration.mjs";

describe("migration verification", () => {
  it("detects count, order, price and permission mismatches", () => {
    const expected = {
      cities: [{ id: "c1", position: 0 }],
      categories: [{ id: "k1", cityId: "c1", position: 0 }],
      products: [{ id: "p1", categoryId: "k1", position: 0 }],
      productPrices: [{ productId: "p1", currency: "BRL", amount: "10.00" }],
      profiles: [{ id: "u1", permissions: { product: { cloneCategory: true } } }],
      productMedia: [], categoryTranslations: [], productTranslations: [], userCities: [], accessRequests: [],
    };
    const actual = {
      ...expected,
      products: [],
      productPrices: [{ productId: "p1", currency: "BRL", amount: "11.00" }],
      profiles: [{ id: "u1", permissions: { product: { cloneCategory: false } } }],
    };

    const report = compareMigration(expected, actual);

    expect(report.ok).toBe(false);
    expect(report.mismatches.map((item) => item.kind)).toEqual(expect.arrayContaining([
      "count", "price", "permissions",
    ]));
  });
});
