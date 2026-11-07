/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

// Load single .env from repository root if present, fallback to local directory
const rootDir = path.resolve(__dirname, '..');
const envDir =
  fs.existsSync(path.resolve(rootDir, '.env')) ||
  fs.existsSync(path.resolve(rootDir, '.env.example'))
    ? rootDir
    : __dirname;

// https://vitejs.dev/config/
export default defineConfig({
  envDir,
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/vite-env.d.ts',
        'src/**/*.gitkeep',
        'src/types/**',
      ],
    },
  },
});
