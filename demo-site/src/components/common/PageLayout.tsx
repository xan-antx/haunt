import { useEffect } from 'react';
import type { ReactNode } from 'react';
import styles from './PageLayout.module.css';

export interface PageLayoutProps {
  /** Descriptive document title for the page. */
  title: string;
  children: ReactNode;
}

/** Shared header / main / footer landmarks and document title. */
export function PageLayout({ title, children }: PageLayoutProps) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.brand}>Lantern Bills</p>
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <p>&copy; 2026 Lantern Bills</p>
      </footer>
    </div>
  );
}

export default PageLayout;
