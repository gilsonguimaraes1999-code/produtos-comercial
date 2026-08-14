import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, isTransientApiError } from './api';
import type { AuthUser, CatalogSnapshot, SessionData } from './types';

const SESSION_KEY = 'sg_showcase_session';

interface AuthContextValue {
  user: AuthUser | null;
  token: string;
  loading: boolean;
  bootstrapCatalog: CatalogSnapshot | null;
  login: (username: string, password: string) => Promise<void>;
  loginAsViewer: (cityName: string) => Promise<void>;
  logout: () => Promise<void>;
  replaceUser: (user: AuthUser) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) {
      setLoading(false);
      return;
    }

    let saved: SessionData | null = null;
    try {
      saved = JSON.parse(raw) as SessionData;
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }

    if (!saved?.token) {
      setLoading(false);
      return;
    }

    // Entra imediatamente com a sessão salva e revalida em segundo plano,
    // evitando tela de carregamento infinita quando o Apps Script está lento.
    setSession(saved);
    setLoading(false);

    const revalidate = async () => {
      try {
        const result = await authApi.validate(saved.token);
        const next = { token: saved.token, user: result.user };
        setSession(next);
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } catch (err) {
        // Só encerra a sessão quando ela é realmente inválida, nunca em falha temporária de rede.
        if (!isTransientApiError(err)) {
          localStorage.removeItem(SESSION_KEY);
          setSession(null);
        }
      }
    };

    void revalidate();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    token: session?.token ?? '',
    loading,
    bootstrapCatalog: session?.catalog ?? null,
    async login(username, password) {
      const next = await authApi.login(username.trim(), password);
      setSession(next);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    },
    async loginAsViewer(cityName) {
      const next = await authApi.viewerLogin(cityName.trim());
      setSession(next);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: next.token, user: next.user }));
    },
    async logout() {
      const token = session?.token;
      setSession(null);
      localStorage.removeItem(SESSION_KEY);
      if (token) {
        try {
          await authApi.logout(token);
        } catch {
          // Sessão local já foi encerrada.
        }
      }
    },
    replaceUser(user) {
      if (!session) return;
      const next = { ...session, user };
      setSession(next);
      localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
