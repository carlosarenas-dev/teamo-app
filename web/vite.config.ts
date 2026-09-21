import { defineConfig } from 'vite';

export default defineConfig({
  build: { outDir: 'dist', emptyOutDir: true },
  server: {
    // En `vite dev` la API la sigue sirviendo el Worker en 8787.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
