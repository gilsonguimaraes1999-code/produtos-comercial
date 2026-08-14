import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, catalogApi } from './api';
import { useAuth } from './auth';
import { useTranslation } from '../i18n';
import { uploadImageToImgbb } from './imgbb';
import { scheduleCatalogImagePreload } from './imagePreload';
import { completeMansionPayloadForSave } from './mansionData';
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
      const languageChanged = languageRef.current !== language;
      const result = await catalogApi.sync(token, force || languageChanged ? -1 : catalogRef.current.revision, language);
      if (result.changed && result.catalog) {
        applyCatalog(result.catalog, false);
      } else setLastSyncAt(Date.now());
      languageRef.current = language;
      setError('');
    } catch (err) {
      setError(err instanceof ApiError ? err.code : 'REQUEST_FAILED');
    } finally {
      inFlightRef.current = false;
      setSyncing(false);
      setLoading(false);
    }
  }, [applyCatalog, language, token]);

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
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 2500);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('online', onVisibility);

    return () => {
      window.clearInterval(interval);
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
      const result = await catalogApi.saveCity(token, city);
      applyCatalog(result.catalog);
    },
    async deleteCity(id) {
      const result = await catalogApi.deleteCity(token, id);
      applyCatalog(result.catalog);
    },
    async reorderCities(ids) {
      const result = await catalogApi.reorderCities(token, ids);
      applyCatalog(result.catalog);
    },
    async saveCategory(category) {
      const result = await catalogApi.saveCategory(token, category);
      applyCatalog(result.catalog);
    },
    async deleteCategory(id) {
      const result = await catalogApi.deleteCategory(token, id);
      applyCatalog(result.catalog);
    },
    async reorderCategories(ids) {
      const result = await catalogApi.reorderCategories(token, ids);
      applyCatalog(result.catalog);
    },
    async saveProduct(product) {
      const existingProduct = product.id
        ? catalogRef.current.products.find((item) => item.id === product.id)
        : undefined;
      const productToSave = normalizeProductPayloadForSave(completeMansionPayloadForSave(product, existingProduct));
      const uploadedImages = [];
      for (const image of productToSave.images) {
        if (image.mediaType === 'video' || (image.url && (!image.source || image.source === image.url))) {
          uploadedImages.push(existingImagePayload(image));
          continue;
        }
        if (!image.source) {
          throw new ApiError('INVALID_IMAGE_CONTENT');
        }
        const result = await uploadImageToImgbb(image.source, image.name || productToSave.name);
        uploadedImages.push({
          id: image.id,
          url: result.url,
          ...(result.deleteUrl ? { deleteUrl: result.deleteUrl } : {}),
          mediaType: image.mediaType || 'image',
          videoProvider: image.videoProvider,
          thumbnailUrl: image.thumbnailUrl,
        });
      }
      const result = await catalogApi.saveProduct(token, { ...productToSave, images: uploadedImages });
      applyCatalog(result.catalog);
    },
    async translateProductLanguage(productId, language) {
      const result = await catalogApi.translateProductLanguage(token, productId, language);
      applyCatalog(result.catalog);
    },
    async cloneProduct(payload) {
      const result = await catalogApi.cloneProduct(token, payload);
      applyCatalog(result.catalog);
    },
    async cloneCategory(payload) {
      const result = await catalogApi.cloneCategory(token, payload);
      applyCatalog(result.catalog);
    },
    async deleteProduct(id) {
      const result = await catalogApi.deleteProduct(token, id);
      applyCatalog(result.catalog);
    },
    async reorderProducts(orders) {
      const result = await catalogApi.reorderProducts(token, orders);
      applyCatalog(result.catalog);
    },
    async saveDescriptionTemplate(template) {
      const result = await catalogApi.saveDescriptionTemplate(token, template);
      applyCatalog(result.catalog);
    },
    async deleteDescriptionTemplate(id) {
      const result = await catalogApi.deleteDescriptionTemplate(token, id);
      applyCatalog(result.catalog);
    },
  }), [applyCatalog, catalog, error, lastSyncAt, loading, refresh, syncing, token]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error('useCatalog deve ser usado dentro de CatalogProvider.');
  return context;
}
