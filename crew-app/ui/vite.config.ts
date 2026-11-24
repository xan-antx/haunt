import { defineConfig } from 'vite';

// Library build for the Crew dashboard: ES format, one file, dist/index.mjs. React, ReactDOM,
// lucide-react and @kirocrew/app-sdk (with every subpath, such as @kirocrew/app-sdk/ui) stay external:
// the dashboard provides them at run time through its import map, so the page shares the host's React.
// ui/dist/index.mjs is a committed build artifact: a Crew install copies the folder and builds nothing.
// emptyOutDir is false on purpose: the patrol writes dist/data/*.json (the static fallback), and a
// rebuild must leave those files alone.
export const HOST_EXTERNALS: (string | RegExp)[] = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'lucide-react',
  /^@kirocrew\/app-sdk/,
];

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
      external: HOST_EXTERNALS,
    },
  },
});
