import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves static files only, so a direct link or reload on /autopay
// would 404. Emit a copy of index.html for every client-side route so each one
// is a real page (HTTP 200). Keep in sync with the routes in src/App.tsx.
const ROUTES = ['autopay', 'confirmation']

function spaRouteFallbacks(): Plugin {
  return {
    name: 'spa-route-fallbacks',
    apply: 'build',
    enforce: 'post', // run after Vite has emitted index.html
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') return
      for (const route of ROUTES) {
        this.emitFile({ type: 'asset', fileName: `${route}/index.html`, source: index.source })
      }
    },
  }
}

// https://vite.dev/config/
// Dev and tests use "/"; the production build is hosted under /haunt/lantern-bills/
// (GitHub project page). The router basename and the translation loadPath both
// read import.meta.env.BASE_URL, so they follow this value.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/haunt/lantern-bills/' : '/',
  plugins: [react(), spaRouteFallbacks()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
}))
