import type { ReactNode } from 'react';

// Test stand-ins for @kirocrew/app-sdk/ui. They render plain elements.
export function PageHeader(props: { title: string; subtitle?: string }): ReactNode {
  return (
    <header>
      <h1>{props.title}</h1>
      {props.subtitle ? <p>{props.subtitle}</p> : null}
    </header>
  );
}
export function Card(props: { children?: ReactNode }): ReactNode {
  return <section>{props.children}</section>;
}
export function CardTitle(props: { children?: ReactNode }): ReactNode {
  return <h2>{props.children}</h2>;
}
export function EmptyState(props: { title?: string; description?: string }): ReactNode {
  return (
    <div role="status">
      {props.title ? <p>{props.title}</p> : null}
      {props.description ? <p>{props.description}</p> : null}
    </div>
  );
}
export function MarkdownRenderer(props: { content: string }): ReactNode {
  return <pre>{props.content}</pre>;
}
