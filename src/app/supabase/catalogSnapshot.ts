import type { CatalogSnapshot, ContentLanguage, CurrencyCode, Product } from "../types";

type Repository = {
  fetchCatalogMetadata(language: ContentLanguage): Promise<{ cities: CatalogSnapshot["cities"]; categories: CatalogSnapshot["categories"] }>;
  fetchCatalogPage(input: { cityId: string; categoryId: string; language: ContentLanguage; currency: CurrencyCode; limit: number; cursor: { position: number; id: string } | null }): Promise<{ products: Product[]; nextCursor: { position: number; id: string } | null }>;
  fetchDescriptionTemplates(): Promise<NonNullable<CatalogSnapshot["descriptionTemplates"]>>;
};

export async function fetchCatalogSnapshot(repository: Repository, language: ContentLanguage, currency: CurrencyCode = "BRL"): Promise<CatalogSnapshot> {
  const [metadata, descriptionTemplates] = await Promise.all([
    repository.fetchCatalogMetadata(language), repository.fetchDescriptionTemplates(),
  ]);
  const productGroups = await Promise.all(metadata.categories.map(async (category) => {
    const products: Product[] = [];
    let cursor: { position: number; id: string } | null = null;
    do {
      const page = await repository.fetchCatalogPage({ cityId: category.cityId, categoryId: category.id, language, currency, limit: 100, cursor });
      products.push(...page.products);
      cursor = page.nextCursor;
    } while (cursor);
    return products;
  }));
  return { revision: Date.now(), cities: metadata.cities, categories: metadata.categories, products: productGroups.flat(), descriptionTemplates };
}
