// App layout: skip link, header with navigation, main landmark, footer, route focus handling,
// and the tour, which lives here so it survives route changes.

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAllRuns } from '../../data/hooks';
import { NAV_ORDER, SCREENS, screenDestinations, screenOfRoute } from '../../model/screens';
import { parseRoute } from '../../routes';
import { HauntLogo } from '../HauntLogo';
import { ScreenIcon } from '../ScreenIcon';
import { TourProvider } from '../tour/Tour';
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

function MenuIcon() {
  return (
    <svg className={styles.menuIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7 H20 M4 12 H20 M4 17 H20" />
    </svg>
  );
}

/**
 * Top_Navigation (Req 20.1–20.5). From 900 px: five one-line items, each a Screen_Icon and a name.
 * Below 900 px: a Menu button that opens the full list, with each item's plain description.
 * The descriptions are display: none from 900 px, so there each link's name is the Screen's name.
 */
function Nav() {
  const state = useAllRuns();
  const runs = state.status === 'ready' ? state.runs : [];
  const destinations = screenDestinations(runs);
  const location = useLocation();
  const current = screenOfRoute(parseRoute(location.pathname));
  const [open, setOpen] = useState(false);
  const listId = useId();
  const menuButton = useRef<HTMLButtonElement>(null);

  // Following a link (or any other navigation) closes the menu.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      menuButton.current?.focus();
    }
  };

  // The Menu button sits beside the brand, and the open list spans the header below them both.
  return (
    <>
      <button
        ref={menuButton}
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        onKeyDown={onKeyDown}
      >
        <MenuIcon />
        Menu
      </button>
      <nav
        id={listId}
        className={[styles.nav, open ? styles.open : ''].filter(Boolean).join(' ')}
        aria-label="Main"
        onKeyDown={onKeyDown}
      >
        <ul>
          {NAV_ORDER.map((id) => {
            const to = destinations[id];
            if (to === null) return null;
            const { name, description } = SCREENS[id];
            const isCurrent = current === id;
            return (
              <li key={id}>
                <Link
                  to={to}
                  className={isCurrent ? styles.active : undefined}
                  aria-current={isCurrent ? 'page' : undefined}
                >
                  <ScreenIcon screen={id} className={styles.navIcon} />
                  <span className={styles.navText}>
                    <span className={styles.navLabel}>{name}</span>
                    <span className={styles.navHint}>{description}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
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
        <TourProvider>
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
        </TourProvider>
      </LiveRegionProvider>
    </HeadingFocusContext.Provider>
  );
}
