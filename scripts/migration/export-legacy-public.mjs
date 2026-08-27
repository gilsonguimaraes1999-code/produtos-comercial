import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const apiUrl = process.env.LEGACY_API_URL;
const outputPath = process.argv[2] || "work/migration/legacy-public-snapshot.json";

if (!apiUrl) throw new Error("LEGACY_API_URL is required");

async function request(action, payload = {}) {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`${action}: ${body.message || response.statusText}`);
  }
  return body.data;
}

function mergeUnique(target, rows = []) {
  for (const row of rows) {
    const key = String(row?.id || JSON.stringify(row));
    if (!target.has(key)) target.set(key, row);
  }
}

const cityResponse = await request("listAccessCities");
const cityNames = cityResponse.cities || [];
const cities = new Map();
const categories = new Map();
const products = new Map();
const descriptionTemplates = new Map();

for (const cityName of cityNames) {
  process.stdout.write(`Exportando ${cityName}... `);
  const session = await request("viewerLogin", { cityName });
  const sync = await request("sync", {
    token: session.token,
    sinceRevision: 0,
    language: "pt",
  });
  const catalog = sync.catalog || {};
  mergeUnique(cities, catalog.cities);
  mergeUnique(categories, catalog.categories);
  mergeUnique(products, catalog.products);
  mergeUnique(descriptionTemplates, catalog.descriptionTemplates);
  await request("logout", { token: session.token }).catch(() => undefined);
  console.log(`${catalog.categories?.length || 0} categorias, ${catalog.products?.length || 0} produtos`);
}

const snapshot = {
  exportedAt: new Date().toISOString(),
  source: "legacy-public-viewer",
  catalog: {
    revision: Date.now(),
    cities: [...cities.values()],
    categories: [...categories.values()],
    products: [...products.values()],
    descriptionTemplates: [...descriptionTemplates.values()],
  },
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(snapshot, null, 2), "utf8");
console.log(`Snapshot salvo em ${outputPath}`);
console.log(JSON.stringify({
  cities: snapshot.catalog.cities.length,
  categories: snapshot.catalog.categories.length,
  products: snapshot.catalog.products.length,
  descriptionTemplates: snapshot.catalog.descriptionTemplates.length,
}, null, 2));
