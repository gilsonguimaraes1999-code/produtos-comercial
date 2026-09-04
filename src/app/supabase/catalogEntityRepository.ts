import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type { Category, City, ContentLanguage, CurrencyCode, DescriptionTemplate, Product } from "../types";
import {
  mapCategoryRow,
  mapCityRow,
  mapDescriptionTemplateRow,
  mapProductRow,
  type CategoryRow,
  type CityRow,
  type ProductRow,
} from "./mappers";

function assertEntityQuery<T>(result: { data: T | null; error: { message?: string } | null }): T | null {
  if (result.error) throw new Error(result.error.message || "CATALOG_ENTITY_QUERY_FAILED");
  return result.data;
}

export function createCatalogEntityRepository(client: SupabaseClient) {
  const storageUrl = (path: string) => client.storage
    ?.from("product-media")
    .getPublicUrl(path).data.publicUrl || path;

  return {
    async fetchCity(id: string, _language: ContentLanguage): Promise<City | null> {
      const row = assertEntityQuery(await client
        .from("cities")
        .select("id, name, position, version, created_at, updated_at")
        .eq("id", id)
        .maybeSingle()) as CityRow | null;
      return row ? mapCityRow(row) : null;
    },

    async fetchCategory(id: string, language: ContentLanguage): Promise<Category | null> {
      const row = assertEntityQuery(await client
        .from("categories")
        .select("id, city_id, icon, position, version, created_at, updated_at, category_translations(language, title, is_source)")
        .eq("id", id)
        .maybeSingle()) as unknown as CategoryRow | null;
      return row ? mapCategoryRow(row, language) : null;
    },

    async fetchProduct(id: string, language: ContentLanguage, currency: CurrencyCode): Promise<Product | null> {
      const row = assertEntityQuery(await client
        .from("products")
        .select(`
          id, category_id, coordinates, storage_weight, import_key,
          sold, buyer_name, buyer_discord_id, position, version, created_at, updated_at,
          product_translations(language, name, description_html, is_source),
          product_prices(currency, amount),
          product_media(id, media_type, storage_path, public_url, thumbnail_path, thumbnail_url, video_provider, position)
        `)
        .eq("id", id)
        .maybeSingle()) as unknown as ProductRow | null;
      return row ? mapProductRow(row, language, currency, storageUrl) : null;
    },

    async fetchDescriptionTemplate(id: string): Promise<DescriptionTemplate | null> {
      const row = assertEntityQuery(await client
        .from("description_templates")
        .select("id, category_id, name, position, is_active, version, created_at, updated_at, description_template_translations(language, html)")
        .eq("id", id)
        .maybeSingle()) as Record<string, unknown> | null;
      return row ? mapDescriptionTemplateRow(row as never) : null;
    },
  };
}

export function getCatalogEntityRepository() {
  return createCatalogEntityRepository(getSupabaseBrowserClient());
}
