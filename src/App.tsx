import { useCallback, useEffect, useState } from 'react';
import { StorePage } from './features/ui/StorePage';
import { PipelinePage } from './features/dashboard/PipelinePage';
import { PolicyPage } from './features/dashboard/PolicyPage';
import { repoUrl } from './config';

type Route = 'store' | 'pipeline' | 'policy';

const ROUTES: { id: Route; label: string; hash: string }[] = [
  { id: 'store', label: 'Store', hash: '#/' },
  { id: 'pipeline', label: 'Pipeline', hash: '#/pipeline' },
  { id: 'policy', label: 'Policy', hash: '#/policy' },
];

function routeFromHash(hash: string): Route {
  if (hash.startsWith('#/pipeline')) return 'pipeline';
  if (hash.startsWith('#/policy')) return 'policy';
  return 'store';
}

export function App() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((hash: string) => {
    window.location.hash = hash;
  }, []);

  return (
    <div className="shell">
      <header className="shell__bar">
        <a className="brand" href="#/" onClick={() => navigate('#/')}>
          <span className="brand__mark" aria-hidden="true">
            ◈
          </span>
          <span className="brand__name">Nimbus</span>
          <span className="brand__tag">Agentic SDLC demo</span>
        </a>

        <nav className="nav" aria-label="Primary">
          {ROUTES.map((item) => (
            <a
              key={item.id}
              href={item.hash}
              className={`nav__link${route === item.id ? ' nav__link--active' : ''}`}
              aria-current={route === item.id ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a className="nav__repo" href={repoUrl} target="_blank" rel="noreferrer">
          Repository ↗
        </a>
      </header>

      <main className="shell__main">
        {route === 'store' && <StorePage />}
        {route === 'pipeline' && <PipelinePage />}
        {route === 'policy' && <PolicyPage />}
      </main>

      <footer className="shell__foot">
        <p>
          Every change to this site was routed by risk: shipped automatically, or held for a human
          code owner. Watch it happen on the <a href="#/pipeline">Pipeline</a> board.
        </p>
      </footer>
    </div>
  );
}
