import type { CatalogSnapshot } from './types';

const loadedImages = new Set<string>();
const pendingImages = new Map<string, Promise<void>>();

function validUrl(url: string | undefined) {
  return Boolean(url && url.trim());
}

export function preloadImage(url: string, timeoutMs = 7000): Promise<void> {
  if (!validUrl(url) || typeof window === 'undefined') return Promise.resolve();
  if (loadedImages.has(url)) return Promise.resolve();
  const pending = pendingImages.get(url);
  if (pending) return pending;

  const promise = new Promise<void>((resolve) => {
    const image = new Image();
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timer);
      pendingImages.delete(url);
      loadedImages.add(url);
      resolve();
    };
    const timer = window.setTimeout(finish, timeoutMs);
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') await image.decode();
      } catch {
        // A imagem já foi carregada; falhas de decode não devem bloquear a interface.
      }
      finish();
    };
    image.onerror = finish;
    image.decoding = 'async';
    image.src = url;
  });

  pendingImages.set(url, promise);
  return promise;
}

export async function preloadCriticalAssets() {
  const assets = ['/alpha-logo.png', '/catalog-bg.png', '/product-area-bg.png', '/cursor-custom.png'];
  await Promise.all(assets.map((asset) => preloadImage(asset, 5000)));
}

export async function preloadCatalogCovers(catalog: CatalogSnapshot) {
  const coverUrls = catalog.products
    .map((product) => product.images[0]?.url)
    .filter((url): url is string => validUrl(url))
    .slice(0, 24);

  await Promise.race([
    Promise.all(coverUrls.map((url) => preloadImage(url, 5000))),
    new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
  ]);
}

export function scheduleCatalogImagePreload(catalog: CatalogSnapshot) {
  if (typeof window === 'undefined') return;
  const urls = Array.from(new Set(catalog.products.flatMap((product) => product.images.map((image) => image.url)).filter(validUrl))) as string[];
  const run = () => {
    let index = 0;
    const batch = () => {
      const next = urls.slice(index, index + 6);
      index += next.length;
      void Promise.all(next.map((url) => preloadImage(url, 9000))).finally(() => {
        if (index < urls.length) window.setTimeout(batch, 120);
      });
    };
    batch();
  };

  const requestIdle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
  if (requestIdle) requestIdle(run);
  else window.setTimeout(run, 350);
}
