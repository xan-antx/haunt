// Type stand-ins for the Crew host packages. The dashboard provides the real modules at run time
// through its import map; they are never installed or bundled (see ui/vite.config.ts).
// Only the parts this page uses are declared, following docs/app-kit/api-reference.md in
// kirodotdev/KiroCrew. The full declarations are served by a running dashboard at
// /vendor/kirocrew-app-sdk.d.ts.
declare module '@kirocrew/app-sdk' {
  /** HTTP failures reject with an AppApiError: name 'AppApiError', numeric `status`, string `body`. */
  export interface AppApiError extends Error {
    name: 'AppApiError';
    status: number;
    body: string;
  }
  /** Permission-scoped client: a path must match a `permissions.api` entry in app.json. */
  export function useAppApi(): { get<T = unknown>(path: string, init?: RequestInit): Promise<T> };
}

declare module '@kirocrew/app-sdk/ui' {
  import type { ReactNode } from 'react';
  export function PageHeader(props: { title: string; subtitle?: string }): ReactNode;
  export function Card(props: { children?: ReactNode }): ReactNode;
  export function CardTitle(props: { children?: ReactNode }): ReactNode;
  export function EmptyState(props: { title?: string; description?: string }): ReactNode;
  export function MarkdownRenderer(props: { content: string }): ReactNode;
}
