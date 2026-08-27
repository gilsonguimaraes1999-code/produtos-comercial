import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ContentLanguage, CurrencyCode } from "../types";

export interface CatalogRealtimeScope {
  cityId: string;
  categoryId: string;
  language: ContentLanguage;
  currency: CurrencyCode;
}

export const catalogQueryKeys = {
  metadata: (language: ContentLanguage) => ["catalog-metadata", language] as const,
  products: (scope: CatalogRealtimeScope) => [
    "catalog-products",
    scope.cityId,
    scope.categoryId,
    scope.language,
    scope.currency,
  ] as const,
};

export function subscribeToCatalog(
  client: SupabaseClient,
  queryClient: QueryClient,
  scope: CatalogRealtimeScope,
): () => void {
  const invalidateProducts = () => queryClient.invalidateQueries({
    queryKey: catalogQueryKeys.products(scope),
  });
  const invalidateMetadata = () => queryClient.invalidateQueries({
    queryKey: catalogQueryKeys.metadata(scope.language),
  });
  const channel = client.channel(`catalog:${scope.cityId}:${scope.categoryId}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "products",
      filter: `category_id=eq.${scope.categoryId}`,
    }, invalidateProducts)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "product_translations",
    }, invalidateProducts)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "product_prices",
    }, invalidateProducts)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "product_media",
    }, invalidateProducts)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "categories",
      filter: `city_id=eq.${scope.cityId}`,
    }, invalidateMetadata)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "category_translations",
    }, invalidateMetadata)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "cities",
    }, invalidateMetadata)
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
