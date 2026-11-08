// App layout: skip link, header with navigation, main landmark, footer, and route focus handling.

import { useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAllRuns } from '../../data/hooks';
import { groupHaunts, startHereTarget } from '../../model/haunts';
import {
  coveragePath,
  exorcisePath,
  graveyardPath,
  homePath,
  mapPath,
  parseRoute,
  seancePath,
  stepPath,
} from '../../routes';
import { Fog } from './Fog';
import { LiveRegionProvider } from './LiveRegion';
import { HeadingFocusContext, type FocusRequest } from './ScreenHeading';
import styles from './Layout.module.css';

/**
 * Which "place" a path is. Focus moves to the new h1 only when this changes, so controls that
 * only change a step, a question, a comparison pair or a filter keep the user's focus.
 */
export function routeIdentity(pathname: string): string {
  const route = parseRoute(pathname);
  switch (route.screen) {
    case 'run':
    case 'step':
      return `ghostcam:${route.key}`;
    case 'map':
      return `map:${route.siteKey}`;
    case 'restless':
      return `restless:${route.key}`;
    default:
      return route.screen;
  }
}

function SkipLink() {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // A plain "#main" link would change the hash route, so move focus by hand.
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  };
  return (
    <a className={styles.skip} href="#main-content" onClick={onClick}>
      Skip to main content
    </a>
  );
}

function Nav() {
  const state = useAllRuns();
  const runs = state.status === 'ready' ? state.runs : [];
  const firstHaunt = groupHaunts(runs)[0];
  const start = startHereTarget(runs);
  const camTarget = start ?? (runs[0] ? { runKey: runs[0].key, step: 1 } : null);
  const location = useLocation();
  const route = parseRoute(location.pathname);

  const items: { to: string; label: string; current: boolean }[] = [
    { to: homePath(), label: 'Home', current: route.screen === 'home' },
    ...(firstHaunt
      ? [{ to: mapPath(firstHaunt.siteKey), label: 'Haunted Map', current: route.screen === 'map' }]
      : []),
    { to: graveyardPath(), label: 'Graveyard', current: route.screen === 'graveyard' },
    ...(camTarget
      ? [
          {
            to: stepPath(camTarget.runKey, camTarget.step),
            label: 'Ghost Cam',
            current: route.screen === 'step' || route.screen === 'run',
          },
        ]
      : []),
    { to: seancePath(), label: 'Séance', current: route.screen === 'seance' },
    { to: exorcisePath(), label: 'Exorcise', current: route.screen === 'exorcise' },
    { to: coveragePath(), label: 'Spec Coverage', current: route.screen === 'coverage' },
  ];

  return (
    <nav className={styles.nav} aria-label="Main">
      <ul>
        {items.map((item) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className={item.current ? styles.active : undefined}
              aria-current={item.current ? 'page' : undefined}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Layout() {
  const location = useLocation();
  const focus = useRef<FocusRequest>({ pending: false });
  const previous = useRef<string | null>(null);

  // Runs before the new screen's layout effects, so its ScreenHeading sees the request.
  useLayoutEffect(() => {
    const identity = routeIdentity(location.pathname);
    if (previous.current !== null && previous.current !== identity) {
      focus.current.pending = true;
      const existing = document.querySelector<HTMLElement>('#main-content h1');
      if (existing) {
        focus.current.pending = false;
        existing.focus();
      }
    }
    previous.current = identity;
  }, [location.pathname]);

  return (
    <HeadingFocusContext.Provider value={focus}>
      <LiveRegionProvider>
        <SkipLink />
        <header className={styles.header}>
          <Fog />
          <div className={styles.headerInner}>
            <Link to="/" className={styles.brand}>
              Haunt
            </Link>
            <Nav />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.main}>
          <Outlet />
        </main>
        <footer className={styles.footer}>
          <p>
            Haunt sends three ghost users through our own sites and shows where they got stuck. Ghosts only
            visit sites we own or local copies we run ourselves.
          </p>
          <p className="muted">
            Fonts: IM Fell English and Atkinson Hyperlegible, both under the SIL Open Font License. Built for
            Kiroween 2026.
          </p>
        </footer>
      </LiveRegionProvider>
    </HeadingFocusContext.Provider>
  );
}
