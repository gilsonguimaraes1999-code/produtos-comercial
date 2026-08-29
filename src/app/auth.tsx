import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase/client';
import { getAuthRepository } from './supabase/authRepository';
import { getCatalogRepository } from './supabase/catalogRepository';
import { fetchCatalogSnapshot } from './supabase/catalogSnapshot';
import type { AuthUser, CatalogSnapshot, SessionData } from './types';

const SESSION_KEY = 'sg_showcase_session';

interface AuthContextValue {
  user: AuthUser | null;
  token: string;
  loading: boolean;
  bootstrapCatalog: CatalogSnapshot | null;
  activationEnabled: boolean;
  login: (username: string, password: string) => Promise<void>;
  activateAccount: (input: { username: string; code: string; password: string }) => Promise<void>;
  loginAsViewer: (cityNames: string[] | string) => Promise<void>;
  logout: () => Promise<void>;
  replaceUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readViewerSession(): SessionData | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as SessionData | null;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function isViewerSession(session: SessionData | null): boolean {
  return session?.token.startsWith('viewer:') === true;
}

function persistViewerSession(session: SessionData): void {
  const { catalog: _catalog, ...lightweightSession } = session;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(lightweightSession));
  } catch {
    // O modo visualizador continua válido nesta aba mesmo se o navegador bloquear storage.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const saved = readViewerSession();

    if (saved?.token.startsWith('viewer:')) {
      setSession(saved);
      setLoading(false);
      return;
    }

    localStorage.removeItem(SESSION_KEY);
    const repository = getAuthRepository();
    const client = getSupabaseBrowserClient();
    let active = true;

    void repository.getCurrentSessionData()
      .then((next) => {
        if (active) {
          setSession((current) => isViewerSession(current) ? current : next);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    const { data: authListener } = client.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setSession((current) => isViewerSession(current) ? current : null);
        return;
      }
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') return;

      window.setTimeout(() => {
        void repository.getCurrentSessionData().then((next) => {
          if (active) {
            setSession((current) => isViewerSession(current) ? current : next);
          }
        });
      }, 0);
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    token: session?.token ?? '',
    loading,
    bootstrapCatalog: session?.catalog ?? null,
    activationEnabled: true,
    async login(username, password) {
      const next = await getAuthRepository().login(username, password);
      localStorage.removeItem(SESSION_KEY);
      setSession(next);
    },
    async activateAccount(input) {
      await getAuthRepository().activate(input);
    },
    async loginAsViewer(cityNames) {
      const requestedNames = Array.isArray(cityNames) ? cityNames : [cityNames];
      const normalizedNames = [...new Set(requestedNames.map((name) => name.trim()).filter(Boolean))];
      if (!normalizedNames.length) throw new Error('INVALID_ACCESS_CITY');

      const cityResult = await getSupabaseBrowserClient().from('cities').select('id, name').in('name', normalizedNames);
      if (cityResult.error || !cityResult.data || cityResult.data.length !== normalizedNames.length) {
        throw new Error('INVALID_ACCESS_CITY');
      }

      const catalog = await fetchCatalogSnapshot(getCatalogRepository(), 'pt');
      const selectedCityIds = new Set(cityResult.data.map((city) => city.id));
      const visibleCities = catalog.cities.filter((item) => selectedCityIds.has(item.id));
      if (visibleCities.length !== normalizedNames.length) throw new Error('INVALID_ACCESS_CITY');

      const cityIds = visibleCities.map((city) => city.id);
      const visibleCategoryIds = new Set(catalog.categories.filter((item) => selectedCityIds.has(item.cityId)).map((item) => item.id));
      const visibleCatalog = {
        ...catalog,
        cities: visibleCities,
        categories: catalog.categories.filter((item) => selectedCityIds.has(item.cityId)),
        products: catalog.products.filter((item) => visibleCategoryIds.has(item.categoryId)),
        descriptionTemplates: (catalog.descriptionTemplates || []).filter((item) => visibleCategoryIds.has(item.categoryId)),
      };
      const viewerId = `viewer:${cityIds.join(',')}`;
      const next: SessionData = {
        token: viewerId,
        user: { id: viewerId, name: visibleCities.map((city) => city.name).join(', '), username: 'viewer', role: 'COMERCIAL', status: 'Ativo', allowedCityIds: cityIds, permissions: { product: {} } },
        catalog: visibleCatalog,
      };
      setSession(next);
      persistViewerSession(next);
    },
    async logout() {
      const token = session?.token;
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
      if (!token) return;

      try {
        if (!token.startsWith('viewer:')) await getAuthRepository().logout();
      } catch {
        // A sessão local já foi encerrada.
      }
    },
    replaceUser(user) {
      if (!session) return;
      const next = { ...session, user };
      setSession(next);
      if (session.token.startsWith('viewer:')) {
        persistViewerSession(next);
      }
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
