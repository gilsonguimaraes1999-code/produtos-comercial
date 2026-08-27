import { createHash } from "node:crypto";

const NAMESPACE = "bd68d0c1-a96a-56af-9ba6-49f7c76579bf";
const LANGUAGES = ["pt", "en", "es"];
const CURRENCIES = ["BRL", "USD", "GBP", "EUR"];

function uuidBytes(uuid) {
  return Buffer.from(uuid.replaceAll("-", ""), "hex");
}

export function stableUuid(scope, legacyId) {
  const hash = createHash("sha1")
    .update(uuidBytes(NAMESPACE))
    .update(`${scope}:${String(legacyId)}`)
    .digest()
    .subarray(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseJson(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function decimalString(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  let normalized = String(value).trim().replace(/[^0-9,.-]/g, "");
  if (normalized.includes(",")) normalized = normalized.replaceAll(".", "").replace(",", ".");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match || match[1] === "-") return null;
  const integer = match[2].replace(/^0+(?=\d)/, "") || "0";
  const fraction = `${match[3] || ""}00`.slice(0, 2);
  return `${integer}.${fraction}`;
}

function position(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizedMedia(row, index, productIds) {
  const url = String(row.url || "");
  const driveMatch = url.match(/^https:\/\/drive\.google\.com\/file\/d\/([^/]+)\/preview/i);
  const inferredDriveVideo = Boolean(driveMatch);
  return {
    id: stableUuid("media", row.id),
    importKey: String(row.id),
    productId: productIds.get(String(row.productId)),
    url,
    thumbnailUrl: row.thumbnailUrl || (driveMatch ? `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w480` : null),
    mediaType: inferredDriveVideo ? "video" : (row.mediaType || "image"),
    videoProvider: inferredDriveVideo ? "drive" : (row.videoProvider || null),
    position: position(row.order, index),
  };
}

function timestamp(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined;
}

function translatedRows(entityId, row, type) {
  const namePrefix = type === "category" ? "title" : "name";
  const descriptionPrefix = "descriptionHtml";
  const nestedNames = parseJson(row.translations, {});
  const nestedDescriptions = parseJson(row.descriptionTranslations, {});
  const sourceLanguage = nestedNames.pt || row[`${namePrefix}BR`] ? "pt"
    : row[`${namePrefix}EN`] ? "en"
      : row[`${namePrefix}ES`] ? "es"
        : "pt";
  return LANGUAGES.flatMap((language) => {
    const suffix = language === "pt" ? "BR" : language.toUpperCase();
    const value = nestedNames[language] || row[`${namePrefix}${suffix}`] || (language === sourceLanguage ? row[namePrefix] : "");
    if (!String(value || "").trim()) return [];
    return [{
      [`${type}Id`]: entityId,
      language,
      ...(type === "category"
        ? { title: String(value).trim() }
        : {
            name: String(value).trim(),
            descriptionHtml: String(nestedDescriptions[language] || row[`${descriptionPrefix}${suffix}`] || (language === sourceLanguage ? row.descriptionHtml : "") || ""),
            translationStatus: language === sourceLanguage ? "source" : "translated",
          }),
      isSource: language === sourceLanguage,
    }];
  });
}

export function normalizeSnapshot(snapshot) {
  const tables = snapshot?.tables || {};
  const cityRows = tables.Cities || snapshot?.catalog?.cities || [];
  const categoryRows = tables.Categories || snapshot?.catalog?.categories || [];
  const productRows = tables.Products || snapshot?.catalog?.products || [];
  const imageRows = tables.ProductImages || productRows.flatMap((row) =>
    (Array.isArray(row.images) ? row.images : []).map((image) => ({ ...image, productId: image.productId || row.id })));
  const userRows = tables.Users || [];
  const templateRows = tables.DescriptionTemplates || snapshot?.catalog?.descriptionTemplates || [];
  const requestRows = tables.SolicitacoesAcesso || tables.AccessRequests || [];
  const cityIds = new Map(cityRows.map((row) => [String(row.id), stableUuid("city", row.id)]));
  const categoryIds = new Map(categoryRows.map((row) => [String(row.id), stableUuid("category", row.id)]));
  const productIds = new Map(productRows.map((row) => [String(row.id), stableUuid("product", row.id)]));

  const cities = cityRows.map((row, index) => ({
    id: cityIds.get(String(row.id)),
    importKey: String(row.id),
    name: String(row.name || "").trim(),
    position: position(row.order, index),
    ...(timestamp(row.createdAt) ? { createdAt: timestamp(row.createdAt) } : {}),
    ...(timestamp(row.updatedAt) ? { updatedAt: timestamp(row.updatedAt) } : {}),
  }));
  const categories = categoryRows.map((row, index) => ({
    id: categoryIds.get(String(row.id)),
    importKey: String(row.id),
    cityId: cityIds.get(String(row.cityId)),
    icon: row.icon || null,
    position: position(row.order, index),
    ...(timestamp(row.createdAt) ? { createdAt: timestamp(row.createdAt) } : {}),
    ...(timestamp(row.updatedAt) ? { updatedAt: timestamp(row.updatedAt) } : {}),
  }));
  const categoryTranslations = categoryRows.flatMap((row) =>
    translatedRows(categoryIds.get(String(row.id)), row, "category"));
  const products = productRows.map((row, index) => ({
    id: productIds.get(String(row.id)),
    importKey: String(row.importKey || row.id),
    categoryId: categoryIds.get(String(row.categoryId)),
    coordinates: row.coordinates || null,
    storageWeight: row.storageWeight || null,
    sold: String(row.sold).toLowerCase() === "true",
    buyerName: row.soldOwnerName || null,
    buyerDiscordId: row.soldOwnerDiscordId || null,
    position: position(row.order, index),
    ...(timestamp(row.createdAt) ? { createdAt: timestamp(row.createdAt) } : {}),
    ...(timestamp(row.updatedAt) ? { updatedAt: timestamp(row.updatedAt) } : {}),
  }));
  const productTranslations = productRows.flatMap((row) =>
    translatedRows(productIds.get(String(row.id)), row, "product"));
  const productPrices = productRows.flatMap((row) => CURRENCIES.flatMap((currency) => {
    const nestedPrices = parseJson(row.prices, {});
    const amount = decimalString(nestedPrices[currency] ?? row[`amount${currency}`]
      ?? (row.currency === currency ? row.amount : undefined));
    return amount === null ? [] : [{ productId: productIds.get(String(row.id)), currency, amount }];
  }));
  const productMedia = imageRows.map((row, index) => normalizedMedia(row, index, productIds));
  const descriptionTemplates = templateRows.map((row, index) => ({
    id: stableUuid("template", row.id),
    categoryId: categoryIds.get(String(row.categoryId)),
    name: String(row.title || "").trim(),
    position: position(row.order, index),
    active: String(row.active).toLowerCase() !== "false",
    translations: { pt: row.htmlBR || "", en: row.htmlEN || "", es: row.htmlES || "" },
  }));
  const profiles = userRows.map((row) => ({
    id: stableUuid("profile", row.id),
    importKey: String(row.id),
    username: String(row.username || "").trim(),
    usernameNormalized: String(row.username || "").trim().toLowerCase(),
    displayName: String(row.name || row.username || "").trim(),
    role: String(row.role).toUpperCase() === "OWNER" ? "owner" : "commercial",
    status: "pending_activation",
    permissions: parseJson(row.permissions, {}),
    ...(timestamp(row.createdAt) ? { createdAt: timestamp(row.createdAt) } : {}),
    ...(timestamp(row.updatedAt) ? { updatedAt: timestamp(row.updatedAt) } : {}),
  }));
  const userCities = userRows.flatMap((row) => parseJson(row.allowedCityIds, []).flatMap((legacyCityId) => {
    const cityId = cityIds.get(String(legacyCityId));
    return cityId ? [{ profileId: stableUuid("profile", row.id), cityId }] : [];
  }));
  const accessRequests = requestRows.map((row) => ({
    id: stableUuid("access-request", row.id),
    displayName: String(row.name || "").trim(),
    username: String(row.username || "").trim(),
    status: String(row.status || "PENDENTE").toLowerCase()
      .replace("pendente", "pending").replace("aprovado", "approved")
      .replace("reprovado", "rejected").replace("removido", "removed"),
    requestedCityIds: parseJson(row.requestedCityNames, [row.cityName]).flatMap((name) => {
      const city = cities.find((candidate) => candidate.name.toLowerCase() === String(name).toLowerCase());
      return city ? [city.id] : [];
    }),
  }));

  return {
    schemaVersion: 1,
    sourceCreatedAt: snapshot?.createdAt || null,
    cities,
    categories,
    categoryTranslations,
    products,
    productTranslations,
    productPrices,
    productMedia,
    descriptionTemplates,
    profiles,
    userCities,
    accessRequests,
    settings: (tables.Meta || []).map((row) => ({ key: String(row.key), value: parseJson(row.value, row.value) })),
  };
}
