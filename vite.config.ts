import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({ root: 'src/renderer', base: './', publicDir: resolve('resources'), esbuild: { jsx: 'automatic', jsxImportSource: 'preact' }, server: { port: 5173, strictPort: true } });
