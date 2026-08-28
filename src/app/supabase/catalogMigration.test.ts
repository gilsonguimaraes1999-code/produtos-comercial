import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202608270016_catalog_concurrency.sql", "utf8");
const pgTap = readFileSync("supabase/tests/catalog_concurrency.test.sql", "utf8");

function functionSection(name: string, nextName: string) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = migration.indexOf(`create or replace function public.${nextName}`, start + 1);
  return migration.slice(start, end);
}

describe("catalog concurrency migration contracts", () => {
  it("serializes saves and reorders through shared order-scope mutexes", () => {
    expect(migration).toContain("lock_catalog_order_scope");
    expect(migration).toMatch(/save_city_v2[\s\S]*lock_catalog_order_scope\('cities'/);
    expect(migration).toMatch(/reorder_cities_v2[\s\S]*lock_catalog_order_scope\('cities'/);
    expect(migration).toMatch(/save_category_v2[\s\S]*lock_catalog_order_scope\('categories'/);
    expect(migration).toMatch(/reorder_categories_v2[\s\S]*lock_catalog_order_scope\('categories'/);
    expect(migration).toMatch(/save_product_v2[\s\S]*lock_catalog_order_scope\('products'/);
    expect(migration).toMatch(/reorder_products_v2[\s\S]*lock_catalog_order_scope\('products'/);
    expect(migration).toContain("lock_catalog_order_mutation");
    expect(migration).toContain("cities_order_scope_lock");
    expect(migration).toContain("categories_order_scope_lock");
    expect(migration).toContain("products_order_scope_lock");
  });

  it("locks only inserts and real moves while leaving ordinary entity edits on row/version locks", () => {
    const citySave = functionSection("save_city_v2", "save_category_v2");
    const categorySave = functionSection("save_category_v2", "save_product_v2");
    const productSave = functionSection("save_product_v2", "save_description_template_v2");

    expect(citySave).toMatch(/if target_city_id is null then\s+perform public\.lock_catalog_order_scope\('cities'/);
    expect(citySave).not.toMatch(/begin\s+perform public\.lock_catalog_order_scope/);
    expect(categorySave).toMatch(/if target_category_id is null then[\s\S]*lock_catalog_order_scope\('categories', target_city_id\)/);
    expect(categorySave).toMatch(/if previous_city_id is distinct from target_city_id then\s+perform public\.lock_catalog_order_scope\('category-moves', null\)/);
    expect(categorySave).toMatch(/select city_id, version into locked_city_id, previous_version[\s\S]*for update/);
    expect(categorySave).toMatch(/if locked_city_id is distinct from previous_city_id then[\s\S]*ORDER_CONFLICT/);
    expect(productSave).toMatch(/if target_product_id is null then[\s\S]*lock_catalog_order_scope\('products', target_category_id\)/);
    expect(productSave).toMatch(/if previous_category_id is distinct from target_category_id then\s+perform public\.lock_catalog_order_scope\('product-moves', null\)/);
    expect(productSave).toMatch(/select category_id, version into locked_category_id, previous_version[\s\S]*for update/);
    expect(productSave).toMatch(/if locked_category_id is distinct from previous_category_id then[\s\S]*ORDER_CONFLICT/);
  });

  it("protects legacy category and product moves without firing on same-scope edits", () => {
    expect(migration).toContain("try_lock_catalog_order_scope");
    expect(migration).toMatch(/create trigger categories_move_scope_lock\s+before update of city_id/);
    expect(migration).toMatch(/when \(old\.city_id is distinct from new\.city_id\)/);
    expect(migration).toMatch(/create trigger products_move_scope_lock\s+before update of category_id/);
    expect(migration).toMatch(/when \(old\.category_id is distinct from new\.category_id\)/);
  });

  it("adds before/after version maps to reorder audit and exercises grants and insert baselines in pgTAP", () => {
    expect(migration).toContain("'versions', previous_versions");
    expect(migration).toContain("'versions', new_versions");
    expect(pgTap).toContain("has_function_privilege");
    expect(pgTap).toContain("insert invalidates an older reorder baseline");
    expect(pgTap).toContain("reorder audit records versions before the change");
    expect(pgTap).toContain("authenticated executes reorder_products_v2");
    expect(pgTap).toContain("anonymous cannot execute save_description_template_v2");
    expect(pgTap).toContain("city reorder audit stores the exact version before");
    expect(pgTap).toContain("product reorder audit stores the exact version after");
  });
});
