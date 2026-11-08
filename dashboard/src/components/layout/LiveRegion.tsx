// A single polite live region for the whole app. Screens call `useAnnounce()`.

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Announce = (message: string) => void;

const AnnounceContext = createContext<Announce>(() => {});

export function useAnnounce(): Announce {
  return useContext(AnnounceContext);
}

export function LiveRegionProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const announce = useCallback<Announce>((next) => {
    window.clearTimeout(timer.current);
    // Clear first, so the same message twice in a row is announced again.
    setMessage('');
    timer.current = window.setTimeout(() => setMessage(next), 50);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true" data-testid="live-region">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}
