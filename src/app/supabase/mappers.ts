import type {
  Category,
  City,
  ContentLanguage,
  CurrencyCode,
  DescriptionTemplate,
  LocalizedText,
  Product,
  ProductImage,
  ProductPrices,
} from "../types";

interface TranslationRow {
  language: ContentLanguage;
  is_source?: boolean;
}

interface CategoryTranslationRow extends TranslationRow {
  title: string;
}

interface ProductTranslationRow extends TranslationRow {
  name: string;
  description_html?: string | null;
}

export interface CityRow {
  id: string;
  name: string;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface CategoryRow {
  id: string;
  city_id: string;
  icon?: string | null;
  position: number;
  created_at?: string;
  updated_at?: string;
  category_translations?: CategoryTranslationRow[] | null;
}

export interface ProductRow {
  id: string;
  category_id: string;
  coordinates?: string | null;
  storage_weight?: string | null;
  import_key?: string | null;
  sold?: boolean;
  buyer_name?: string | null;
  buyer_discord_id?: string | null;
  position: number;
  created_at?: string;
  updated_at?: string;
  product_translations?: ProductTranslationRow[] | null;
  product_prices?: Array<{ currency: CurrencyCode; amount: string | number }> | null;
  product_media?: Array<{
    id: string;
    media_type: "image" | "video";
    storage_path?: string | null;
    public_url?: string | null;
    thumbnail_path?: string | null;
    thumbnail_url?: string | null;
    video_provider?: string | null;
    position: number;
  }> | null;
}

function translationFallback<T extends TranslationRow>(rows: T[], language: ContentLanguage): T | undefined {
  return rows.find((row) => row.language === language)
    || rows.find((row) => row.is_source)
    || rows.find((row) => row.language === "pt")
    || rows[0];
}

function translationMap<T extends TranslationRow>(
  rows: T[],
  value: (row: T) => string,
): LocalizedText {
  return Object.fromEntries(rows.map((row) => [row.language, value(row)])) as LocalizedText;
}

export function mapCityRow(row: CityRow): City {
  return {
    id: row.id,
    name: row.name,
    order: row.position,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export function mapCategoryRow(row: CategoryRow, language: ContentLanguage): Category {
  const translations = row.category_translations || [];
  const selected = translationFallback(translations, language);
  return {
    id: row.id,
    cityId: row.city_id,
    title: selected?.title || "",
    translations: translationMap(translations, (translation) => translation.title),
    icon: row.icon || "Box",
    order: row.position,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export function mapProductRow(
  row: ProductRow,
  language: ContentLanguage,
  currency: CurrencyCode,
  storageUrl: (path: string) => string = (path) => path,
): Product {
  const translations = row.product_translations || [];
  const selected = translationFallback(translations, language);
  const prices = Object.fromEntries(
    (row.product_prices || []).map((price) => [price.currency, Number(price.amount)]),
  ) as ProductPrices;
  const images: ProductImage[] = (row.product_media || [])
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((media) => ({
      id: media.id,
      productId: row.id,
      url: media.public_url || (media.storage_path ? storageUrl(media.storage_path) : ""),
      order: media.position,
      mediaType: media.media_type,
      ...(media.video_provider ? { videoProvider: media.video_provider as ProductImage["videoProvider"] } : {}),
      ...(media.thumbnail_url
        ? { thumbnailUrl: media.thumbnail_url }
        : media.thumbnail_path
          ? { thumbnailUrl: storageUrl(media.thumbnail_path) }
          : {}),
    }));

  return {
    id: row.id,
    categoryId: row.category_id,
    ...(row.coordinates ? { coordinates: row.coordinates } : {}),
    ...(row.storage_weight ? { storageWeight: row.storage_weight } : {}),
    ...(row.import_key ? { importKey: row.import_key } : {}),
    name: selected?.name || "",
    translations: translationMap(translations, (translation) => translation.name),
    descriptionHtml: selected?.description_html || "",
    descriptionTranslations: translationMap(translations, (translation) => translation.description_html || ""),
    sold: row.sold === true,
    ...(row.buyer_name ? { soldOwnerName: row.buyer_name } : {}),
    ...(row.buyer_discord_id ? { soldOwnerDiscordId: row.buyer_discord_id } : {}),
    amount: prices[currency] ?? null,
    currency,
    prices,
    order: row.position,
    images,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}

export function mapDescriptionTemplateRow(row: {
  id: string;
  category_id: string;
  name: string;
  position: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  description_template_translations?: Array<{ language: ContentLanguage; html: string }> | null;
}): DescriptionTemplate {
  const translations = Object.fromEntries(
    (row.description_template_translations || []).map((item) => [item.language, item.html]),
  ) as LocalizedText;
  return {
    id: row.id,
    categoryId: row.category_id,
    title: row.name,
    order: row.position,
    active: row.is_active,
    htmlBR: translations.pt || "",
    htmlEN: translations.en || "",
    htmlES: translations.es || "",
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  };
}
