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
export default defineConfig({
  plugins: [react(), contentSecurityPolicy()],
  // Relative base so the built site works from any static host path.
  base: './',
  server: {
    port: 3001,
    strictPort: true,
  },
  preview: {
    port: 3001,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
