import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from './api';
import { useAuth } from './auth';
import { useTranslation } from '../i18n';
import { scheduleCatalogImagePreload } from './imagePreload';
import { completeMansionPayloadForSave } from './mansionData';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getCatalogRepository } from './supabase/catalogRepository';
import { getCatalogEntityRepository } from './supabase/catalogEntityRepository';
import { getCatalogMutations } from './supabase/catalogMutations';
import { getMediaRepository } from './supabase/mediaRepository';
import { fetchCatalogSnapshot } from './supabase/catalogSnapshot';
import { subscribeToCatalog, type CatalogRealtimeEvent } from './supabase/realtime';
import type { CatalogSnapshot, CategoryPayload, City, CityPayload, CloneCategoryPayload, CloneProductPayload, ContentLanguage, CurrencyCode, DescriptionTemplatePayload, DraftImageInput, MutationResult, ProductPayload } from './types';

interface CatalogContextValue {
  catalog: CatalogSnapshot;
  loading: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string;
  busyEntityIds: ReadonlySet<string>;
  refresh: (force?: boolean) => Promise<void>;
  saveCity: (city: CityPayload) => Promise<MutationResult>;
  deleteCity: (id: string) => Promise<void>;
  reorderCities: (ids: string[], expectedOrder: string[]) => Promise<void>;
  saveCategory: (category: CategoryPayload) => Promise<MutationResult>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[], expectedOrder: string[]) => Promise<void>;
  saveProduct: (product: ProductPayload) => Promise<MutationResult>;
  translateProductLanguage: (productId: string, language: ContentLanguage) => Promise<void>;
  cloneProduct: (payload: CloneProductPayload) => Promise<void>;
  cloneCategory: (payload: CloneCategoryPayload) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  reorderProducts: (orders: Array<{ categoryId: string; productIds: string[]; expectedOrder: string[] }>) => Promise<void>;
  saveDescriptionTemplate: (template: DescriptionTemplatePayload) => Promise<MutationResult>;
  deleteDescriptionTemplate: (id: string) => Promise<void>;
}

const emptyCatalog: CatalogSnapshot = { revision: 0, cities: [], categories: [], products: [], descriptionTemplates: [] };
const CatalogContext = createContext<CatalogContextValue | null>(null);
const CATALOG_CACHE_PREFIX = 'sg_catalog_cache_v3';

function catalogCacheKey(userId: string, language: string) {
  return `${CATALOG_CACHE_PREFIX}:${userId}:${language}`;
}

function readCatalogCache(userId: string, language: string): CatalogSnapshot | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = window.localStorage.getItem(catalogCacheKey(userId, language));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { catalog?: CatalogSnapshot };
    return parsed.catalog && Array.isArray(parsed.catalog.products) ? parsed.catalog : null;
  } catch {
    return null;
  }
}

function writeCatalogCache(userId: string, language: string, catalog: CatalogSnapshot) {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(catalogCacheKey(userId, language), JSON.stringify({ savedAt: Date.now(), catalog }));
  } catch {
    // O catálogo ao vivo continua funcionando mesmo se o navegador estiver sem espaço local.
  }
}

function normalizeCatalogSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  const fallbackCity: City = {
    id: 'legacy-default-city',
    name: 'SantaGroup',
    order: 0,
  };
  const cities = Array.isArray(snapshot.cities) ? snapshot.cities : [fallbackCity];
  const firstCityId = cities[0]?.id || fallbackCity.id;
  const categories = (snapshot.categories || []).map((category) => ({
    ...category,
    cityId: category.cityId || firstCityId,
  }));

  return {
    ...snapshot,
    cities,
    categories,
    products: snapshot.products || [],
    descriptionTemplates: snapshot.descriptionTemplates || [],
  };
}

function existingImagePayload(image: DraftImageInput): DraftImageInput {
  return {
    ...(image.id ? { id: image.id } : {}),
    ...(image.url ? { url: image.url } : {}),
    ...(image.mediaType ? { mediaType: image.mediaType } : { mediaType: 'image' }),
    ...(image.videoProvider ? { videoProvider: image.videoProvider } : {}),
    ...(image.thumbnailUrl ? { thumbnailUrl: image.thumbnailUrl } : {}),
    ...(image.name ? { name: image.name } : {}),
  };
}

function normalizeProductPayloadForSave(product: ProductPayload): ProductPayload {
  const prices = Object.entries(product.prices || {}).reduce<ProductPayload['prices']>((acc, [currency, value]) => {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount >= 0) acc[currency as CurrencyCode] = amount;
    return acc;
  }, {});
  const currentAmount = Number(product.amount);
  const amount = Number.isFinite(currentAmount) && currentAmount >= 0 ? currentAmount : null;
  const currency = product.currency || 'BRL';

  if (!Object.keys(prices).length) {
    prices[currency] = amount ?? 0;
  }

  return {
    ...product,
    currency,
    prices,
    amount: amount ?? prices[currency] ?? 0,
    images: product.images.filter((image) => image.mediaType === 'video' || image.url || image.source),
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { token, user, bootstrapCatalog } = useAuth();
  const { language } = useTranslation();
  const bootstrapRef = useRef<CatalogSnapshot | null>(bootstrapCatalog);
  const initialCache = bootstrapRef.current || readCatalogCache(user?.id || '', language);
  const [catalog, setCatalog] = useState<CatalogSnapshot>(initialCache || emptyCatalog);
  const [loading, setLoading] = useState(!initialCache);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busyEntityIds, setBusyEntityIds] = useState<ReadonlySet<string>>(() => new Set());
  const catalogRef = useRef(catalog);
  const languageRef = useRef(language);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const realtimeDisconnectedRef = useRef(false);

  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

  const applyCatalog = useCallback((next: CatalogSnapshot, broadcast = true) => {
    const normalized = normalizeCatalogSnapshot(next);
    setCatalog(normalized);
    catalogRef.current = normalized;
    setLastSyncAt(Date.now());
    setError('');
    scheduleCatalogImagePreload(normalized);
    writeCatalogCache(user?.id || '', languageRef.current, normalized);
    if (broadcast) broadcastRef.current?.postMessage({ type: 'catalog-revision', revision: next.revision });
  }, [user?.id]);

  const commitCatalog = useCallback((transform: (current: CatalogSnapshot) => CatalogSnapshot) => {
    const current = catalogRef.current;
    const next = transform(current);
    if (next === current) return;
    applyCatalog({ ...next, revision: Math.max(next.revision, current.revision + 1, Date.now()) }, false);
  }, [applyCatalog]);

  const upsertEntity = useCallback((event: CatalogRealtimeEvent, entity: unknown) => {
    commitCatalog((current) => {
      const sortByOrder = <T extends { id: string; order: number }>(items: T[]) => items
        .slice()
        .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
      if (event.entity === 'city') {
        const next = entity as CatalogSnapshot['cities'][number];
        const existing = current.cities.find((item) => item.id === next.id);
        if (Number(existing?.version || 0) >= Number(next.version || 0)) return current;
        return { ...current, cities: sortByOrder([...current.cities.filter((item) => item.id !== next.id), next]) };
      }
      if (event.entity === 'category') {
        const next = entity as CatalogSnapshot['categories'][number];
        const existing = current.categories.find((item) => item.id === next.id);
        if (Number(existing?.version || 0) >= Number(next.version || 0)) return current;
        return { ...current, categories: sortByOrder([...current.categories.filter((item) => item.id !== next.id), next]) };
      }
      if (event.entity === 'product') {
        const next = entity as CatalogSnapshot['products'][number];
        const existing = current.products.find((item) => item.id === next.id);
        if (Number(existing?.version || 0) >= Number(next.version || 0)) return current;
        return { ...current, products: sortByOrder([...current.products.filter((item) => item.id !== next.id), next]) };
      }
      const next = entity as NonNullable<CatalogSnapshot['descriptionTemplates']>[number];
      const templates = current.descriptionTemplates || [];
      const existing = templates.find((item) => item.id === next.id);
      if (Number(existing?.version || 0) >= Number(next.version || 0)) return current;
      return { ...current, descriptionTemplates: sortByOrder([...templates.filter((item) => item.id !== next.id), next]) };
    });
  }, [commitCatalog]);

  const removeEntity = useCallback((event: CatalogRealtimeEvent) => {
    commitCatalog((current) => {
      if (event.entity === 'city') {
        const categoryIds = new Set(current.categories.filter((item) => item.cityId === event.id).map((item) => item.id));
        return {
          ...current,
          cities: current.cities.filter((item) => item.id !== event.id),
          categories: current.categories.filter((item) => item.cityId !== event.id),
          products: current.products.filter((item) => !categoryIds.has(item.categoryId)),
          descriptionTemplates: (current.descriptionTemplates || []).filter((item) => !categoryIds.has(item.categoryId)),
        };
      }
      if (event.entity === 'category') return {
        ...current,
        categories: current.categories.filter((item) => item.id !== event.id),
        products: current.products.filter((item) => item.categoryId !== event.id),
        descriptionTemplates: (current.descriptionTemplates || []).filter((item) => item.categoryId !== event.id),
      };
      if (event.entity === 'product') return { ...current, products: current.products.filter((item) => item.id !== event.id) };
      return { ...current, descriptionTemplates: (current.descriptionTemplates || []).filter((item) => item.id !== event.id) };
    });
  }, [commitCatalog]);

  const reconcileEntity = useCallback(async (event: CatalogRealtimeEvent) => {
    if (event.deleted) {
      removeEntity(event);
      return;
    }
    const repository = getCatalogEntityRepository();
    const entity = event.entity === 'city'
      ? await repository.fetchCity(event.id, languageRef.current as ContentLanguage)
      : event.entity === 'category'
        ? await repository.fetchCategory(event.id, languageRef.current as ContentLanguage)
        : event.entity === 'product'
          ? await repository.fetchProduct(event.id, languageRef.current as ContentLanguage, 'BRL')
          : await repository.fetchDescriptionTemplate(event.id);
    if (entity) upsertEntity(event, entity);
    else removeEntity({ ...event, deleted: true });
  }, [removeEntity, upsertEntity]);

  const withBusyEntity = useCallback(async <T,>(id: string, operation: () => Promise<T>): Promise<T> => {
    setBusyEntityIds((current) => new Set(current).add(id));
    try {
      return await operation();
    } finally {
      setBusyEntityIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const inFlightRef = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (!token) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSyncing(true);
    try {
      const snapshot = await fetchCatalogSnapshot(getCatalogRepository(), language);
      const allowedIds = user?.role === 'OWNER' ? null : new Set(user?.allowedCityIds || []);
      const categories = allowedIds ? snapshot.categories.filter((item) => allowedIds.has(item.cityId)) : snapshot.categories;
      const categoryIds = new Set(categories.map((item) => item.id));
      applyCatalog(allowedIds ? {
        ...snapshot,
        cities: snapshot.cities.filter((item) => allowedIds.has(item.id)),
        categories,
        products: snapshot.products.filter((item) => categoryIds.has(item.categoryId)),
        descriptionTemplates: (snapshot.descriptionTemplates || []).filter((item) => categoryIds.has(item.categoryId)),
      } : snapshot, false);
      languageRef.current = language;
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'REQUEST_FAILED');
    } finally {
      inFlightRef.current = false;
      setSyncing(false);
      setLoading(false);
    }
  }, [applyCatalog, language, token, user?.allowedCityIds, user?.role]);

  useEffect(() => {
    if (!token) return;
    languageRef.current = language;
    const cached = bootstrapRef.current || readCatalogCache(user?.id || '', language);
    if (cached) {
      applyCatalog(cached, false);
      bootstrapRef.current = null;
      setLoading(false);
    } else {
      setCatalog(emptyCatalog);
      catalogRef.current = emptyCatalog;
      setLoading(true);
    }
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastRef.current = new BroadcastChannel('sg-showcase-live');
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'catalog-revision' && Number(event.data.revision) > catalogRef.current.revision) {
          void refresh();
        }
      };
    }

    void refresh(!cached);
    const client = getSupabaseBrowserClient();
    const removeRealtime = subscribeToCatalog(
      client,
      (event) => void reconcileEntity(event).catch(() => {
        realtimeDisconnectedRef.current = true;
      }),
      100,
      (status) => {
        if (status === 'SUBSCRIBED') {
          const mustRecover = realtimeDisconnectedRef.current;
          realtimeDisconnectedRef.current = false;
          if (mustRecover) void refresh(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeDisconnectedRef.current = true;
        }
      },
    );

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && realtimeDisconnectedRef.current) void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('online', onVisibility);

    return () => {
      removeRealtime();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('online', onVisibility);
      broadcastRef.current?.close();
      broadcastRef.current = null;
    };
  }, [applyCatalog, language, reconcileEntity, refresh, token, user?.id]);

  const value = useMemo<CatalogContextValue>(() => ({
    catalog,
    loading,
    syncing,
    lastSyncAt,
    error,
    busyEntityIds,
    refresh,
    async saveCity(city) {
      return withBusyEntity(city.id || 'new:city', async () => {
        const result = await getCatalogMutations().saveCity(city);
        await reconcileEntity({ entity: 'city', id: result.id, deleted: false });
        return result;
      });
    },
    async deleteCity(id) {
      await withBusyEntity(id, async () => {
        await getCatalogMutations().deleteCity(id);
        removeEntity({ entity: 'city', id, deleted: true });
      });
    },
    async reorderCities(ids, expectedOrder) {
      await withBusyEntity('order:cities', async () => {
        await getCatalogMutations().reorderCities(ids, expectedOrder);
        await Promise.all(ids.map((id) => reconcileEntity({ entity: 'city', id, deleted: false })));
      });
    },
    async saveCategory(category) {
      return withBusyEntity(category.id || 'new:category', async () => {
        const result = await getCatalogMutations().saveCategory(category);
        await reconcileEntity({ entity: 'category', id: result.id, deleted: false });
        return result;
      });
    },
    async deleteCategory(id) {
      await withBusyEntity(id, async () => {
        await getCatalogMutations().deleteCategory(id);
        removeEntity({ entity: 'category', id, deleted: true });
      });
    },
    async reorderCategories(ids, expectedOrder) {
      const cityId = catalogRef.current.categories.find((item) => ids.includes(item.id))?.cityId;
      if (!cityId) throw new Error('CITY_NOT_FOUND');
      await withBusyEntity(`order:categories:${cityId}`, async () => {
        await getCatalogMutations().reorderCategories(cityId, ids, expectedOrder);
        await Promise.all(ids.map((id) => reconcileEntity({ entity: 'category', id, deleted: false })));
      });
    },
    async saveProduct(product) {
      return withBusyEntity(product.id || 'new:product', async () => {
        const existingProduct = product.id
          ? catalogRef.current.products.find((item) => item.id === product.id)
          : undefined;
        const productToSave = normalizeProductPayloadForSave(completeMansionPayloadForSave(product, existingProduct));
        const mutations = getCatalogMutations();
        const mediaRepository = getMediaRepository();
        const sourceImages = productToSave.images.filter((image) => image.mediaType !== 'video' && image.source && image.source !== image.url);
        const retainedImages = productToSave.images.filter((image) => !sourceImages.includes(image)).map(existingImagePayload);
        let productId = productToSave.id;
        let confirmedVersion = productToSave.version;
        let result;

        if (!productId) {
          result = await mutations.saveProduct({ ...productToSave, images: retainedImages });
          productId = result.id;
          confirmedVersion = result.version;
        }

        const uploaded = [];
        for (let index = 0; index < sourceImages.length; index += 1) {
          const sourceImage = sourceImages[index];
          if (!sourceImage) throw new ApiError('INVALID_IMAGE_CONTENT');
          const source = sourceImage.source;
          if (!source) throw new ApiError('INVALID_IMAGE_CONTENT');
          const response = await fetch(source);
          const blob = await response.blob();
          const file = new File([blob], sourceImage.name || `${productToSave.name}-${index + 1}`, { type: blob.type });
          if (!productId) throw new Error('INVALID_MUTATION_RESULT');
          uploaded.push(await mediaRepository.uploadProductMedia(productId, file, retainedImages.length + index));
        }

        if (productToSave.id || sourceImages.length > 0) {
          if (!productId) throw new Error('INVALID_MUTATION_RESULT');
          result = await mutations.saveProduct({
            ...productToSave,
            id: productId,
            version: confirmedVersion,
            images: [...retainedImages, ...uploaded],
          });
        }
        if (!result) throw new Error('INVALID_MUTATION_RESULT');

        if (!product.id && productToSave.autoTranslate !== false) {
          const translated = await getSupabaseBrowserClient().functions.invoke('translate-product', { body: { productId, sourceLanguage: productToSave.sourceLanguage } });
          if (translated.error) throw translated.error;
        }
        await reconcileEntity({ entity: 'product', id: result.id, deleted: false });
        return result;
      });
    },
    async translateProductLanguage(productId, language) {
      await withBusyEntity(productId, async () => {
        const result = await getSupabaseBrowserClient().functions.invoke('translate-product', { body: { productId, targetLanguage: language } });
        if (result.error) throw result.error;
        await reconcileEntity({ entity: 'product', id: productId, deleted: false });
      });
    },
    async cloneProduct(payload) {
      await withBusyEntity(payload.productId, async () => {
        const id = await getCatalogMutations().cloneProduct(payload);
        await reconcileEntity({ entity: 'product', id, deleted: false });
      });
    },
    async cloneCategory(payload) {
      await withBusyEntity(payload.categoryId, async () => {
        const id = await getCatalogMutations().cloneCategory(payload);
        await reconcileEntity({ entity: 'category', id, deleted: false });
      });
    },
    async deleteProduct(id) {
      await withBusyEntity(id, async () => {
        await getCatalogMutations().deleteProduct(id);
        removeEntity({ entity: 'product', id, deleted: true });
      });
    },
    async reorderProducts(orders) {
      for (const order of orders) {
        await withBusyEntity(`order:products:${order.categoryId}`, async () => {
          await getCatalogMutations().reorderProducts(order.categoryId, order.productIds, order.expectedOrder);
          await Promise.all(order.productIds.map((id) => reconcileEntity({ entity: 'product', id, deleted: false })));
        });
      }
    },
    async saveDescriptionTemplate(template) {
      return withBusyEntity(template.id || 'new:template', async () => {
        const result = await getCatalogMutations().saveDescriptionTemplate(template);
        await reconcileEntity({ entity: 'template', id: result.id, deleted: false });
        return result;
      });
    },
    async deleteDescriptionTemplate(id) {
      await withBusyEntity(id, async () => {
        await getCatalogMutations().deleteDescriptionTemplate(id);
        removeEntity({ entity: 'template', id, deleted: true });
      });
    },
  }), [busyEntityIds, catalog, commitCatalog, error, lastSyncAt, loading, reconcileEntity, refresh, removeEntity, syncing, withBusyEntity]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog deve ser usado dentro de CatalogProvider.');
  return context;
}
