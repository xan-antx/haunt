// The one h1 per screen. Focused after a route change (not on first load), and sets the document title.

import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

export interface FocusRequest {
  /** True after a route change until a ScreenHeading takes focus. */
  pending: boolean;
}

export const HeadingFocusContext = createContext<{ current: FocusRequest }>({ current: { pending: false } });

export function useDocumentTitle(title: string): void {
  // A layout effect, so the title changes in the same commit as the new h1.
  useLayoutEffect(() => {
    document.title = title ? `${title} · Haunt` : 'Haunt';
  }, [title]);
}

export function ScreenHeading({
  children,
  title,
  className,
  tooltip,
}: {
  children: ReactNode;
  /** Document title without the " · Haunt" suffix. */
  title: string;
  className?: string;
  /** Full heading text, for the `title` attribute when CSS shortens the heading with an ellipsis. */
  tooltip?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const focus = useContext(HeadingFocusContext);
  useDocumentTitle(title);
  useLayoutEffect(() => {
    if (focus.current.pending && ref.current) {
      focus.current.pending = false;
      ref.current.focus();
    }
  });
  return (
    <h1 ref={ref} tabIndex={-1} className={className} title={tooltip}>
      {children}
    </h1>
  );
}
