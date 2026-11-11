import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

/**
 * Adds the Content-Security-Policy meta tag to production builds only.
 * Vite's dev server needs inline scripts for hot reloading, so dev is left alone.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'haunt-csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command, isPreview, mode }) => ({
  plugins: [react(), contentSecurityPolicy()],
  // GitHub project page: production lives under /haunt/. `vite preview` serves that
  // production build, so it uses the same base. Dev keeps normal paths.
  base: command === 'build' || isPreview ? '/haunt/' : '/',
  // `--mode e2e` builds and previews the fixed test runs from fixtures/runs/ (collected into
  // .e2e/public/runs/ by `npm run build:e2e`), apart from the real build in dist/.
  publicDir: mode === 'e2e' ? '.e2e/public' : 'public',
  server: {
    port: 3001,
    strictPort: true,
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
  build: {
    outDir: mode === 'e2e' ? '.e2e/dist' : 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', '.e2e/**', 'e2e/**', 'test-results/**'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}));
