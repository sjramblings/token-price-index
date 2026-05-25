import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const scriptsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../scripts',
);

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@scripts': scriptsDirectory,
    },
  },
});
