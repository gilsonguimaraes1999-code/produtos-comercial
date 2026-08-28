import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type {
  CatalogPage,
  Category,
  City,
  ContentLanguage,
  CurrencyCode,
  DescriptionTemplate,
} from "../types";
import {
  mapCategoryRow,
  mapCityRow,
  mapDescriptionTemplateRow,
  mapProductRow,
  type CategoryRow,
  type CityRow,
  type ProductRow,
} from "./mappers";

export interface CatalogPageInput {
  cityId: string;
  categoryId: string;
  language: ContentLanguage;
  currency?: CurrencyCode;
  limit?: number;
  cursor?: { position: number; id: string } | null;
}

function assertQuery<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error || result.data === null) {
    throw new Error(result.error?.message || "CATALOG_QUERY_FAILED");
  }
  return result.data;
}

export function createCatalogRepository(client: SupabaseClient) {
  const storageUrl = (path: string) => client.storage
    ?.from("product-media")
    .getPublicUrl(path).data.publicUrl || path;

  return {
    async fetchCatalogMetadata(language: ContentLanguage): Promise<{
      cities: City[];
      categories: Category[];
    }> {
      const [citiesResult, categoriesResult] = await Promise.all([
        client
          .from("cities")
          .select("id, name, position, version, created_at, updated_at")
          .order("position", { ascending: true })
          .order("id", { ascending: true }),
        client
          .from("categories")
          .select("id, city_id, icon, position, version, created_at, updated_at, category_translations(language, title, is_source)")
          .order("position", { ascending: true })
          .order("id", { ascending: true }),
      ]);

      const cities = assertQuery(citiesResult) as CityRow[];
      const categories = assertQuery(categoriesResult) as unknown as CategoryRow[];
      return {
        cities: cities.map(mapCityRow),
        categories: categories.map((row) => mapCategoryRow(row, language)),
      };
    },

    async fetchCatalogPage(input: CatalogPageInput): Promise<CatalogPage> {
      const limit = Math.min(Math.max(input.limit || 24, 1), 100);
      let query = client
        .from("products")
        .select(`
          id, category_id, coordinates, storage_weight, import_key,
          sold, buyer_name, buyer_discord_id, position, version, created_at, updated_at,
          product_translations(language, name, description_html, is_source),
          product_prices(currency, amount),
          product_media(id, media_type, storage_path, public_url, thumbnail_path, thumbnail_url, video_provider, position)
        `)
        .eq("category_id", input.categoryId)
        .order("position", { ascending: true })
        .order("id", { ascending: true });

      if (input.cursor) {
        const position = Math.max(0, Math.trunc(input.cursor.position));
        query = query.or(
          `position.gt.${position},and(position.eq.${position},id.gt.${input.cursor.id})`,
        );
      }

      const result = await query.limit(limit + 1);
      const rows = assertQuery(result) as unknown as ProductRow[];
      const visibleRows = rows.slice(0, limit);
      const last = visibleRows.at(-1);
      return {
        products: visibleRows.map((row) => mapProductRow(
          row,
          input.language,
          input.currency || "BRL",
          storageUrl,
        )),
        nextCursor: rows.length > limit && last
          ? { position: last.position, id: last.id }
          : null,
      };
    },

    async fetchDescriptionTemplates(): Promise<DescriptionTemplate[]> {
      const result = await client
        .from("description_templates")
        .select("id, category_id, name, position, is_active, version, created_at, updated_at, description_template_translations(language, html)")
        .order("position", { ascending: true })
        .order("id", { ascending: true });
      const rows = assertQuery(result) as Array<Record<string, unknown>>;
      return rows.map((row) => mapDescriptionTemplateRow(row as never));
    },
  };
}

export function getCatalogRepository() {
  return createCatalogRepository(getSupabaseBrowserClient());
}
