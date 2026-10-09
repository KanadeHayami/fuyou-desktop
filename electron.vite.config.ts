import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';
export default defineConfig({
  main: {}, preload: {},
  renderer: { root: 'src/renderer', base: './', publicDir: resolve('resources'), esbuild: { jsx: 'automatic', jsxImportSource: 'preact' } }
});
