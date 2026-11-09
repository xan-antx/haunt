// App layout: skip link, header with navigation, main landmark, footer, and route focus handling.

import { useLayoutEffect, useRef, type MouseEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAllRuns } from '../../data/hooks';
import { NAV_ORDER, SCREENS, screenDestinations, screenOfRoute } from '../../model/screens';
import { parseRoute } from '../../routes';
import { HauntLogo } from '../HauntLogo';
import { Fog } from './Fog';
import { LiveRegionProvider } from './LiveRegion';
import { NextStop } from './NextStop';
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
  const destinations = screenDestinations(runs);
  const location = useLocation();
  const current = screenOfRoute(parseRoute(location.pathname));

  return (
    <nav className={styles.nav} aria-label="Main">
      <ul>
        {NAV_ORDER.map((id) => {
          const to = destinations[id];
          if (to === null) return null;
          const { name, description } = SCREENS[id];
          const isCurrent = current === id;
          // The accessible name comes from all the visible text, name first, then the plain-words
          // description, so it contains the visible label (Req 20.1 to 20.3, WCAG 2.5.3).
          return (
            <li key={id}>
              <Link
                to={to}
                className={isCurrent ? styles.active : undefined}
                aria-current={isCurrent ? 'page' : undefined}
              >
                <span className={styles.navLabel}>{name}</span>
                {description && <span className={styles.navHint}>{description}</span>}
              </Link>
            </li>
          );
        })}
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
              <HauntLogo />
              <span>Haunt</span>
            </Link>
            <Nav />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className={styles.main}>
          <Outlet />
          <NextStop />
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
