import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const collections = [
  "cities", "categories", "categoryTranslations", "products",
  "productTranslations", "productPrices", "productMedia", "profiles",
  "userCities", "accessRequests",
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(value));
}

function tupleSet(rows, fields) {
  return new Set((rows || []).map((row) => fields.map((field) => row[field] ?? null).join("|")));
}

export function compareMigration(expected, actual) {
  const mismatches = [];
  for (const collection of collections) {
    const expectedCount = expected[collection]?.length || 0;
    const actualCount = actual[collection]?.length || 0;
    if (expectedCount !== actualCount) {
      mismatches.push({ kind: "count", collection, expected: expectedCount, actual: actualCount });
    }
  }

  for (const [collection, groupField] of [["cities", null], ["categories", "cityId"], ["products", "categoryId"]]) {
    const groups = new Set((expected[collection] || []).map((row) => groupField ? row[groupField] : "all"));
    for (const group of groups) {
      const sequence = (rows) => (rows || [])
        .filter((row) => !groupField || row[groupField] === group)
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
        .map((row) => row.id);
      const expectedOrder = sequence(expected[collection]);
      const actualOrder = sequence(actual[collection]);
      if (stable(expectedOrder) !== stable(actualOrder)) {
        mismatches.push({ kind: "order", collection, group, expected: expectedOrder, actual: actualOrder });
      }
    }
  }

  const expectedPrices = tupleSet(expected.productPrices, ["productId", "currency", "amount"]);
  const actualPrices = tupleSet(actual.productPrices, ["productId", "currency", "amount"]);
  if (stable([...expectedPrices].sort()) !== stable([...actualPrices].sort())) {
    mismatches.push({ kind: "price", expected: [...expectedPrices].sort(), actual: [...actualPrices].sort() });
  }

  const actualProfiles = new Map((actual.profiles || []).map((profile) => [profile.id, profile]));
  for (const profile of expected.profiles || []) {
    const actualProfile = actualProfiles.get(profile.id);
    if (actualProfile && stable(profile.permissions || {}) !== stable(actualProfile.permissions || {})) {
      mismatches.push({ kind: "permissions", profileId: profile.id });
    }
  }

  return {
    ok: mismatches.length === 0,
    checkedAt: new Date().toISOString(),
    mismatches,
    counts: Object.fromEntries(collections.map((key) => [key, actual[key]?.length || 0])),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [expectedPath, actualPath] = process.argv.slice(2);
  if (!expectedPath || !actualPath) throw new Error("Usage: verify-migration.mjs EXPECTED.json ACTUAL.json");
  const [expected, actual] = await Promise.all([
    readFile(expectedPath, "utf8").then(JSON.parse),
    readFile(actualPath, "utf8").then(JSON.parse),
  ]);
  const report = compareMigration(expected, actual);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}
