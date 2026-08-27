import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type {
  CategoryPayload,
  CityPayload,
  CloneCategoryPayload,
  CloneProductPayload,
  DescriptionTemplatePayload,
  ProductPayload,
} from "../types";

function decimalAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_PRICE");
  return value.toFixed(2);
}

function assertMutation<T>(result: { data: T; error: { message?: string } | null }): T {
  if (result.error) throw new Error(result.error.message || "CATALOG_MUTATION_FAILED");
  return result.data;
}

export function createCatalogMutations(client: SupabaseClient) {
  return {
    async saveCity(payload: CityPayload): Promise<string> {
      const result = await client.rpc("save_city", {
        target_city_id: payload.id || null,
        city_name: payload.name.trim(),
      });
      return assertMutation(result) as string;
    },

    async deleteCity(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_city", { target_city_id: id }));
    },

    async reorderCities(ids: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_cities", { requested_order: ids }));
    },

    async saveCategory(payload: CategoryPayload): Promise<string> {
      const result = await client.rpc("save_category", {
        target_category_id: payload.id || null,
        target_city_id: payload.cityId,
        category_icon: payload.icon,
        translation_payload: {
          language: payload.sourceLanguage,
          title: payload.title.trim(),
          translate_missing: !payload.id,
        },
      });
      return assertMutation(result) as string;
    },

    async deleteCategory(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_category", { target_category_id: id }));
    },

    async reorderCategories(cityId: string, ids: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_categories", {
        target_city_id: cityId,
        requested_order: ids,
      }));
    },

    async saveProduct(payload: ProductPayload): Promise<string> {
      const prices = Object.entries(payload.prices || {}).map(([currency, amount]) => ({
        currency,
        amount: decimalAmount(Number(amount)),
      }));
      const result = await client.rpc("save_product", {
        target_product_id: payload.id || null,
        target_category_id: payload.categoryId,
        product_payload: {
          coordinates: payload.coordinates || null,
          storage_weight: payload.storageWeight || null,
          sold: payload.sold === true,
          buyer_name: payload.soldOwnerName || null,
          buyer_discord_id: payload.soldOwnerDiscordId || null,
        },
        translation_payload: {
          language: payload.sourceLanguage,
          name: payload.name.trim(),
          description_html: payload.descriptionHtml || "",
          translate_missing: !payload.id && payload.autoTranslate !== false,
        },
        price_payload: prices,
        media_payload: payload.images.map((image, position) => ({
          id: image.id || null,
          public_url: image.url || null,
          media_type: image.mediaType || "image",
          video_provider: image.videoProvider || null,
          thumbnail_url: image.thumbnailUrl || null,
          position,
        })),
      });
      return assertMutation(result) as string;
    },

    async deleteProduct(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_product", { target_product_id: id }));
    },

    async reorderProducts(categoryId: string, ids: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_products", {
        target_category_id: categoryId,
        requested_order: ids,
      }));
    },

    async cloneProduct(payload: CloneProductPayload): Promise<string> {
      return assertMutation(await client.rpc("clone_product", {
        source_product_id: payload.productId,
        target_category_id: payload.targetCategoryId,
      })) as string;
    },

    async cloneCategory(payload: CloneCategoryPayload): Promise<string> {
      return assertMutation(await client.rpc("clone_category", {
        source_category_id: payload.categoryId,
        target_city_id: payload.targetCityId,
      })) as string;
    },

    async saveDescriptionTemplate(payload: DescriptionTemplatePayload): Promise<string> {
      return assertMutation(await client.rpc("save_description_template", {
        target_template_id: payload.id || null,
        target_category_id: payload.categoryId,
        template_name: payload.title.trim(),
        template_position: payload.order ?? null,
        template_active: payload.active,
        translations_payload: {
          pt: payload.htmlBR,
          en: payload.htmlEN,
          es: payload.htmlES,
        },
      })) as string;
    },

    async deleteDescriptionTemplate(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_description_template", { target_template_id: id }));
    },
  };
}

export function getCatalogMutations() {
  return createCatalogMutations(getSupabaseBrowserClient());
}
