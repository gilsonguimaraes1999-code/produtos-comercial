import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function allRows(client, table, columns = "*") {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const result = await client.from(table).select(columns).range(start, start + 999);
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) return rows;
  }
}

const client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const [cities, categories, categoryTranslations, products, productTranslations, productPrices,
  productMedia, profiles, userCities, accessRequests] = await Promise.all([
  allRows(client, "cities"), allRows(client, "categories"), allRows(client, "category_translations"),
  allRows(client, "products"), allRows(client, "product_translations"), allRows(client, "product_prices"),
  allRows(client, "product_media"), allRows(client, "profiles"), allRows(client, "user_cities"),
  allRows(client, "access_requests"),
]);

const snapshot = {
  schemaVersion: 1,
  cities: cities.map((row) => ({ id: row.id, name: row.name, position: row.position })),
  categories: categories.map((row) => ({ id: row.id, cityId: row.city_id, position: row.position })),
  categoryTranslations: categoryTranslations.map((row) => ({ categoryId: row.category_id, language: row.language, title: row.title })),
  products: products.map((row) => ({ id: row.id, categoryId: row.category_id, position: row.position })),
  productTranslations: productTranslations.map((row) => ({ productId: row.product_id, language: row.language, name: row.name })),
  productPrices: productPrices.map((row) => ({ productId: row.product_id, currency: row.currency, amount: Number(row.amount).toFixed(2) })),
  productMedia: productMedia.map((row) => ({ id: row.id, productId: row.product_id, url: row.public_url })),
  profiles: profiles.map((row) => ({ id: row.id, username: row.username, permissions: {} })),
  userCities: userCities.map((row) => ({ profileId: row.profile_id, cityId: row.city_id })),
  accessRequests: accessRequests.map((row) => ({ id: row.id })),
};

const output = process.argv[2] || "work/migration/supabase-actual-snapshot.json";
await writeFile(output, JSON.stringify(snapshot, null, 2), "utf8");
console.log(JSON.stringify(Object.fromEntries(Object.entries(snapshot)
  .filter(([, value]) => Array.isArray(value))
  .map(([key, value]) => [key, value.length])), null, 2));
