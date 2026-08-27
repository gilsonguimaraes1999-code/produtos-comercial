import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { LanguageSwitcher, useTranslation } from '../i18n';
import { useAuth } from './auth';
import { CatalogProvider } from './catalog';
import { CatalogApp } from './components/CatalogApp';
import { Login } from './components/Login';
import { preloadCriticalAssets } from './imagePreload';
import { hasSupabaseBrowserEnv } from '../lib/supabase/env';

export type AppRouteMode = 'auto' | 'login' | 'dashboard';

export default function App({ routeMode = 'auto' }: { routeMode?: AppRouteMode }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [assetsReady, setAssetsReady] = useState(false);
  const backendConfigured = hasSupabaseBrowserEnv();

  useEffect(() => {
    let active = true;
    void preloadCriticalAssets().finally(() => {
      if (active) setAssetsReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!assetsReady || loading || !backendConfigured) return;

    if (routeMode === 'auto') {
      void navigate({ to: user ? '/dashboard' : '/login', replace: true });
      return;
    }

    if (routeMode === 'login' && user) {
      void navigate({ to: '/dashboard', replace: true });
    }

    if (routeMode === 'dashboard' && !user) {
      void navigate({ to: '/login', replace: true });
    }
  }, [assetsReady, backendConfigured, loading, navigate, routeMode, user]);

  let content;

  if (!assetsReady) {
    content = (
      <div className="boot-screen site-preloader">
        <img src="/alpha-logo.png" alt="" aria-hidden="true" />
        <span className="spinner" />
      </div>
    );
  } else if (!backendConfigured) {
    content = (
      <main className="config-error">
        <img src="/alpha-logo.png" alt={t('siteName')} />
        <h1>{t('apiNotConfiguredTitle')}</h1>
        <p>{t('apiNotConfiguredDescription')}</p>
        <pre>{t('apiNotConfiguredCode')}</pre>
      </main>
    );
  } else if (loading) {
    content = <div className="boot-screen"><span className="spinner" /></div>;
  } else if (routeMode === 'auto') {
    content = <div className="boot-screen"><span className="spinner" /></div>;
  } else if (routeMode === 'login' && !user) {
    content = <Login />;
  } else if (routeMode === 'dashboard' && user) {
    content = <CatalogProvider><CatalogApp /></CatalogProvider>;
  } else {
    content = <div className="boot-screen"><span className="spinner" /></div>;
  }

  return (
    <>
      {content}
      <div className="floating-language-switcher">
        <LanguageSwitcher compact />
      </div>
    </>
  );
}
