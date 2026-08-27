import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";

const CACHE_KEY = "comercial-products-query-cache-v1";

export function createAppQueryClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: 2,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  });

  if (typeof window === "undefined") return client;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") as unknown;
    if (cached) hydrate(client, cached);
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }

  let timer = 0;
  client.getQueryCache().subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const state = dehydrate(client, {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success"
            && String(query.queryKey[0] || "").startsWith("catalog-"),
        });
        localStorage.setItem(CACHE_KEY, JSON.stringify(state));
      } catch {
        // Falta de espaço local nunca interrompe o catálogo ao vivo.
      }
    }, 100);
  });
  return client;
}
