// The one plain sentence right after a screen's h1 that says what the screen shows (Req 20.13).

import type { ReactNode } from 'react';

export function ScreenIntro({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={className} data-screen-intro="">
      {children}
    </p>
  );
}
