import type { CatalogSnapshot, ContentLanguage, CurrencyCode, Product } from "../types";

type Repository = {
  fetchCatalogMetadata(language: ContentLanguage): Promise<{ cities: CatalogSnapshot["cities"]; categories: CatalogSnapshot["categories"] }>;
  fetchCatalogPage(input: { cityId: string; categoryId: string; language: ContentLanguage; currency: CurrencyCode; limit: number; cursor: { position: number; id: string } | null }): Promise<{ products: Product[]; nextCursor: { position: number; id: string } | null }>;
  fetchDescriptionTemplates(): Promise<NonNullable<CatalogSnapshot["descriptionTemplates"]>>;
};

const CATEGORY_READ_CONCURRENCY = 4;
const STATEMENT_TIMEOUT_RETRIES = 1;

async function mapWithConcurrency<T, R>(items: T[], operation: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(CATEGORY_READ_CONCURRENCY, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(items[index]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function fetchProductPageWithRetry(
  repository: Repository,
  input: Parameters<Repository["fetchCatalogPage"]>[0],
) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await repository.fetchCatalogPage(input);
    } catch (error) {
      const isStatementTimeout = error instanceof Error && /statement timeout/i.test(error.message);
      if (!isStatementTimeout || attempt >= STATEMENT_TIMEOUT_RETRIES) throw error;
    }
  }
}

export async function fetchCatalogSnapshot(repository: Repository, language: ContentLanguage, currency: CurrencyCode = "BRL"): Promise<CatalogSnapshot> {
  const [metadata, descriptionTemplates] = await Promise.all([
    repository.fetchCatalogMetadata(language), repository.fetchDescriptionTemplates(),
  ]);
  const productGroups = await mapWithConcurrency(metadata.categories, async (category) => {
    const products: Product[] = [];
    let cursor: { position: number; id: string } | null = null;
    do {
      const page = await fetchProductPageWithRetry(repository, { cityId: category.cityId, categoryId: category.id, language, currency, limit: 100, cursor });
      products.push(...page.products);
      cursor = page.nextCursor;
    } while (cursor);
    return products;
  });
  return { revision: Date.now(), cities: metadata.cities, categories: metadata.categories, products: productGroups.flat(), descriptionTemplates };
}
