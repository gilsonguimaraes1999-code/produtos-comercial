import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, catalogApi } from './api';
import { useAuth } from './auth';
import { useTranslation } from '../i18n';
import { uploadImageToImgbb } from './imgbb';
import { preloadCatalogCovers, scheduleCatalogImagePreload } from './imagePreload';
import { completeMansionPayloadForSave } from './mansionData';
import type { CatalogSnapshot, CategoryPayload, City, CityPayload, CloneCategoryPayload, CloneProductPayload, ContentLanguage, DescriptionTemplatePayload, ProductPayload } from './types';

interface CatalogContextValue {
  catalog: CatalogSnapshot;
  loading: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  error: string;
  refresh: (force?: boolean) => Promise<void>;
  saveCity: (city: CityPayload) => Promise<void>;
  deleteCity: (id: string) => Promise<void>;
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

function normalizeCatalogSnapshot(snapshot: CatalogSnapshot): CatalogSnapshot {
  const fallbackCity: City = {
    id: 'legacy-default-city',
    name: 'SantaGroup',
    order: 0,
  };
  const cities = Array.isArray(snapshot.cities) && snapshot.cities.length ? snapshot.cities : [fallbackCity];
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

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { language } = useTranslation();
  const [catalog, setCatalog] = useState<CatalogSnapshot>(emptyCatalog);
  const [loading, setLoading] = useState(true);
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
    if (broadcast) broadcastRef.current?.postMessage({ type: 'catalog-revision', revision: next.revision });
  }, []);

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
        if (catalogRef.current.revision === 0) await preloadCatalogCovers(result.catalog);
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
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastRef.current = new BroadcastChannel('sg-showcase-live');
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === 'catalog-revision' && Number(event.data.revision) > catalogRef.current.revision) {
          void refresh();
        }
      };
    }

    void refresh(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 4000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
      broadcastRef.current?.close();
      broadcastRef.current = null;
    };
  }, [language, refresh, token]);

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
      const productToSave = completeMansionPayloadForSave(product, existingProduct);
      const uploadedImages = [];
      for (const image of productToSave.images) {
        if (image.mediaType === 'video' || (image.url && !image.source)) {
          uploadedImages.push(image);
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
