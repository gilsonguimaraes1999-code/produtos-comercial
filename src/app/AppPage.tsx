import { ClientOnly } from '@tanstack/react-router';
import { LanguageProvider } from '../i18n';
import { AuthProvider } from './auth';
import App, { type AppRouteMode } from './App';

export function AppPage({ routeMode }: { routeMode: AppRouteMode }) {
  return (
    <ClientOnly
      fallback={
        <div className="boot-screen">
          <span className="spinner" />
        </div>
      }
    >
      <LanguageProvider>
        <AuthProvider>
          <App routeMode={routeMode} />
        </AuthProvider>
      </LanguageProvider>
    </ClientOnly>
  );
}
