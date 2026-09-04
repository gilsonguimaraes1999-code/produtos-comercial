import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseBrowserClient } from "../../lib/supabase/client";
import type {
  CategoryPayload,
  CityPayload,
  CloneCategoryPayload,
  CloneProductPayload,
  DescriptionTemplatePayload,
  MutationResult,
  ProductPayload,
} from "../types";

export type CatalogConflictKind = "entity" | "order";

export class CatalogConflictError extends Error {
  readonly code: "EDIT_CONFLICT" | "ORDER_CONFLICT";

  constructor(readonly kind: CatalogConflictKind) {
    const code = kind === "entity" ? "EDIT_CONFLICT" : "ORDER_CONFLICT";
    super(code);
    this.name = "CatalogConflictError";
    this.code = code;
  }
}

function decimalAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error("INVALID_PRICE");
  return value.toFixed(2);
}

function assertMutation<T>(result: { data: T; error: { message?: string; code?: string; details?: string } | null }): T {
  if (result.error) {
    const errorText = [result.error.message, result.error.details].filter(Boolean).join(" ");
    if (errorText.includes("EDIT_CONFLICT")) throw new CatalogConflictError("entity");
    if (errorText.includes("ORDER_CONFLICT")) throw new CatalogConflictError("order");
    throw new Error(result.error.message || "CATALOG_MUTATION_FAILED");
  }
  return result.data;
}

function expectedVersion(payload: { id?: string | undefined; version?: number | undefined }): number | null {
  if (!payload.id) return null;
  if (!Number.isFinite(payload.version)) throw new Error("EXPECTED_VERSION_REQUIRED");
  return Number(payload.version);
}

function mutationResult(value: unknown): MutationResult {
  if (!value || typeof value !== "object") throw new Error("INVALID_MUTATION_RESULT");
  const record = value as { id?: unknown; version?: unknown };
  const id = String(record.id || "");
  const version = Number(record.version);
  if (!id || !Number.isFinite(version)) throw new Error("INVALID_MUTATION_RESULT");
  return { id, version };
}

export function createCatalogMutations(client: SupabaseClient) {
  return {
    async saveCity(payload: CityPayload): Promise<MutationResult> {
      const result = await client.rpc("save_city_v2", {
        target_city_id: payload.id || null,
        city_name: payload.name.trim(),
        expected_version: expectedVersion(payload),
      });
      return mutationResult(assertMutation(result));
    },

    async deleteCity(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_city", { target_city_id: id }));
    },

    async reorderCities(ids: string[], expectedOrder: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_cities_v2", { requested_order: ids, expected_order: expectedOrder }));
    },

    async saveCategory(payload: CategoryPayload): Promise<MutationResult> {
      const result = await client.rpc("save_category_v2", {
        target_category_id: payload.id || null,
        target_city_id: payload.cityId,
        category_icon: payload.icon,
        translation_payload: {
          language: payload.sourceLanguage,
          title: payload.title.trim(),
          translate_missing: !payload.id,
        },
        expected_version: expectedVersion(payload),
      });
      return mutationResult(assertMutation(result));
    },

    async deleteCategory(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_category", { target_category_id: id }));
    },

    async reorderCategories(cityId: string, ids: string[], expectedOrder: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_categories_v2", {
        target_city_id: cityId,
        requested_order: ids,
        expected_order: expectedOrder,
      }));
    },

    async saveProduct(payload: ProductPayload): Promise<MutationResult> {
      const prices = Object.entries(payload.prices || {}).map(([currency, amount]) => ({
        currency,
        amount: decimalAmount(Number(amount)),
      }));
      const result = await client.rpc("save_product_v2", {
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
        expected_version: expectedVersion(payload),
      });
      return mutationResult(assertMutation(result));
    },

    async deleteProduct(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_product", { target_product_id: id }));
    },

    async reorderProducts(categoryId: string, ids: string[], expectedOrder: string[]): Promise<void> {
      assertMutation(await client.rpc("reorder_products_v2", {
        target_category_id: categoryId,
        requested_order: ids,
        expected_order: expectedOrder,
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

    async saveDescriptionTemplate(payload: DescriptionTemplatePayload): Promise<MutationResult> {
      return mutationResult(assertMutation(await client.rpc("save_description_template_v2", {
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
        expected_version: expectedVersion(payload),
      })));
    },

    async deleteDescriptionTemplate(id: string): Promise<void> {
      assertMutation(await client.rpc("delete_description_template", { target_template_id: id }));
    },
  };
}

export function getCatalogMutations() {
  return createCatalogMutations(getSupabaseBrowserClient());
}
