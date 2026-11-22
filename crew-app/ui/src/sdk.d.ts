// Type stand-ins for the Crew host packages. The real ones are supplied by the Crew host at run time.
// UNVERIFIED: the exact props and the shape of `get`. Re-check against the Crew App Kit.
declare module '@kirocrew/app-sdk' {
  export function useAppApi(): { get(path: string): Promise<unknown> };
}

declare module '@kirocrew/app-sdk/ui' {
  import type { ReactNode } from 'react';
  export function PageHeader(props: { title: string; subtitle?: string }): ReactNode;
  export function Card(props: { children?: ReactNode }): ReactNode;
  export function CardTitle(props: { children?: ReactNode }): ReactNode;
  export function EmptyState(props: { title?: string; description?: string }): ReactNode;
  export function MarkdownRenderer(props: { content: string }): ReactNode;
}
