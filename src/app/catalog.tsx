import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from './api';
import { useAuth } from './auth';
import { useTranslation } from '../i18n';
import { scheduleCatalogImagePreload } from './imagePreload';
import { completeMansionPayloadForSave } from './mansionData';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getCatalogRepository } from './supabase/catalogRepository';
import { getCatalogMutations } from './supabase/catalogMutations';
import { getMediaRepository } from './supabase/mediaRepository';
import { fetchCatalogSnapshot } from './supabase/catalogSnapshot';
import type { CatalogSnapshot, CategoryPayload, City, CityPayload, CloneCategoryPayload, CloneProductPayload, ContentLanguage, CurrencyCode, DescriptionTemplatePayload, DraftImageInput, ProductPayload } from './types';

interface CatalogContextValue {
  catalog: CatalogSnapshot;
  loading: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string;
  refresh: (force?: boolean) => Promise<void>;
  saveCity: (city: CityPayload) => Promise<void>;
  deleteCity: (id: string) => Promise<void>;
  reorderCities: (ids: string[]) => Promise<void>;
  saveCategory: (category: CategoryPayload) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (ids: string[]) => Promise<void>;
  saveProduct: (product: ProductPayload) => Promise<void>;
  translateProductLanguage: (productId: string, language: ContentLanguage) => Promise<void>;
  cloneProduct: (payload: CloneProductPayload) => Promise<void>;
  cloneCategory: (payload: CloneCategoryPayload) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  reorderProducts: (orders: Array<{ categoryId: string; productIds: string[] }>) => Promise<void>;
  saveDescriptionTemplate: (template: DescriptionTemplatePayload) => Promise<void>;
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
  const catalogRef = useRef(catalog);
  const languageRef = useRef(language);
  const broadcastRef = useRef<BroadcastChannel | null>(null);

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
    let interval = 0;
    let removeRealtime: (() => void) | null = null;
    let realtimeTimer = 0;
    const client = getSupabaseBrowserClient();
    const channel = client.channel(`catalog-live:${user?.id || 'viewer'}`);
    for (const table of ['cities', 'categories', 'category_translations', 'products', 'product_translations', 'product_prices', 'product_media', 'description_templates', 'description_template_translations']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        window.clearTimeout(realtimeTimer);
        realtimeTimer = window.setTimeout(() => void refresh(true), 150);
      });
    }
    channel.subscribe();
    removeRealtime = () => {
      window.clearTimeout(realtimeTimer);
      void client.removeChannel(channel);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('online', onVisibility);

    return () => {
      if (interval) window.clearInterval(interval);
      removeRealtime?.();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('online', onVisibility);
      broadcastRef.current?.close();
      broadcastRef.current = null;
    };
  }, [applyCatalog, language, refresh, token, user?.id]);

  const value = useMemo<CatalogContextValue>(() => ({
    catalog,
    loading,
    syncing,
    lastSyncAt,
    error,
    refresh,
    async saveCity(city) {
      await getCatalogMutations().saveCity(city);
      await refresh(true);
    },
    async deleteCity(id) {
      await getCatalogMutations().deleteCity(id);
      await refresh(true);
    },
    async reorderCities(ids) {
      await getCatalogMutations().reorderCities(ids);
      await refresh(true);
    },
    async saveCategory(category) {
      await getCatalogMutations().saveCategory(category);
      await refresh(true);
    },
    async deleteCategory(id) {
      await getCatalogMutations().deleteCategory(id);
      await refresh(true);
    },
    async reorderCategories(ids) {
      const cityId = catalogRef.current.categories.find((item) => ids.includes(item.id))?.cityId;
      if (!cityId) throw new Error('CITY_NOT_FOUND');
      await getCatalogMutations().reorderCategories(cityId, ids);
      await refresh(true);
    },
    async saveProduct(product) {
      const existingProduct = product.id
        ? catalogRef.current.products.find((item) => item.id === product.id)
        : undefined;
      const productToSave = normalizeProductPayloadForSave(completeMansionPayloadForSave(product, existingProduct));
      const mutations = getCatalogMutations();
      const mediaRepository = getMediaRepository();
      const sourceImages = productToSave.images.filter((image) => image.mediaType !== 'video' && image.source && image.source !== image.url);
      const retainedImages = productToSave.images.filter((image) => !sourceImages.includes(image)).map(existingImagePayload);
      let productId = productToSave.id;
      if (!productId) productId = await mutations.saveProduct({ ...productToSave, images: retainedImages });
      const uploaded = [];
      for (let index = 0; index < sourceImages.length; index += 1) {
        const source = sourceImages[index].source;
        if (!source) throw new ApiError('INVALID_IMAGE_CONTENT');
        const response = await fetch(source);
        const blob = await response.blob();
        const file = new File([blob], sourceImages[index].name || `${productToSave.name}-${index + 1}`, { type: blob.type });
        uploaded.push(await mediaRepository.uploadProductMedia(productId, file, retainedImages.length + index));
      }
      await mutations.saveProduct({ ...productToSave, id: productId, images: [...retainedImages, ...uploaded] });
      if (!product.id && productToSave.autoTranslate !== false) {
        const translated = await getSupabaseBrowserClient().functions.invoke('translate-product', { body: { productId, sourceLanguage: productToSave.sourceLanguage } });
        if (translated.error) throw translated.error;
      }
      await refresh(true);
    },
    async translateProductLanguage(productId, language) {
      const result = await getSupabaseBrowserClient().functions.invoke('translate-product', { body: { productId, targetLanguage: language } });
      if (result.error) throw result.error;
      await refresh(true);
    },
    async cloneProduct(payload) {
      await getCatalogMutations().cloneProduct(payload); await refresh(true);
    },
    async cloneCategory(payload) {
      await getCatalogMutations().cloneCategory(payload); await refresh(true);
    },
    async deleteProduct(id) {
      await getCatalogMutations().deleteProduct(id); await refresh(true);
    },
    async reorderProducts(orders) {
      for (const order of orders) await getCatalogMutations().reorderProducts(order.categoryId, order.productIds);
      await refresh(true);
    },
    async saveDescriptionTemplate(template) {
      await getCatalogMutations().saveDescriptionTemplate(template); await refresh(true);
    },
    async deleteDescriptionTemplate(id) {
      await getCatalogMutations().deleteDescriptionTemplate(id); await refresh(true);
    },
  }), [catalog, error, lastSyncAt, loading, refresh, syncing]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog deve ser usado dentro de CatalogProvider.');
  return context;
}
