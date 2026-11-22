import { defineConfig } from 'vite';

// Library build for the Crew host: ES format, host-provided packages stay external.
// emptyOutDir is false on purpose: the patrol writes dist/data/*.json (the static fallback), and an
// update rebuild must leave those files alone.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/App.tsx',
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', '@kirocrew/app-sdk', '@kirocrew/app-sdk/ui'],
    },
  },
});
