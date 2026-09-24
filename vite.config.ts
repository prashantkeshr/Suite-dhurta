/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  base: process.env.VITE_BASE ?? '/',
  worker: { format: 'es' },
  // Pre-bundle lazily imported libraries so the dev server doesn't reload the
  // page the first time a tool imports one. (No effect on production builds.)
  optimizeDeps: {
    include: ['pdf-lib', 'fflate', 'diff', 'marked', 'dompurify', 'yaml', 'sql-formatter', 'xlsx', 'prettier/standalone', 'prettier/plugins/babel', 'prettier/plugins/estree', 'prettier/plugins/typescript', 'prettier/plugins/html', 'prettier/plugins/postcss', 'prettier/plugins/markdown', 'prettier/plugins/yaml', 'prettier/plugins/graphql'],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
