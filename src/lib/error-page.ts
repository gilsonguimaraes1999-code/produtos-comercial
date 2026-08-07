export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Não foi possível carregar esta página</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #050505; color: #fff; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; text-align: center; padding: 2rem; border: 1px solid rgba(212,175,55,.3); border-radius: 1rem; background: rgba(255,255,255,.035); }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: rgba(255,255,255,.62); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.65rem 1rem; border-radius: 0.65rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid rgba(212,175,55,.45); }
      .primary { background: #d4af37; color: #080705; font-weight: 800; }
      .secondary { background: rgba(255,255,255,.04); color: #fff; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 id="title">Não foi possível carregar esta página</h1>
      <p id="description">Algo deu errado. Tente novamente ou volte para o início.</p>
      <div class="actions">
        <button id="retry" class="primary" onclick="location.reload()">Tentar novamente</button>
        <a id="home" class="secondary" href="/">Ir para o início</a>
      </div>
    </div>
    <script>
      (() => {
        const saved = localStorage.getItem('language');
        const browser = (navigator.language || '').toLowerCase();
        const language = saved === 'us' || saved === 'gb' ? 'en' : saved === 'eu' ? 'es' : saved === 'pt' ? 'pt'
          : browser.startsWith('en') ? 'en' : browser.startsWith('es') ? 'es' : 'pt';
        const copy = {
          pt: { lang: 'pt-BR', title: 'Não foi possível carregar esta página', description: 'Algo deu errado. Tente novamente ou volte para o início.', retry: 'Tentar novamente', home: 'Ir para o início' },
          en: { lang: 'en', title: 'This page could not be loaded', description: 'Something went wrong. Try again or go back home.', retry: 'Try again', home: 'Go home' },
          es: { lang: 'es', title: 'No se pudo cargar esta página', description: 'Algo salió mal. Inténtalo de nuevo o vuelve al inicio.', retry: 'Intentar de nuevo', home: 'Ir al inicio' },
        }[language];
        document.documentElement.lang = copy.lang;
        document.title = copy.title;
        document.getElementById('title').textContent = copy.title;
        document.getElementById('description').textContent = copy.description;
        document.getElementById('retry').textContent = copy.retry;
        document.getElementById('home').textContent = copy.home;
      })();
    </script>
  </body>
</html>`;
}
