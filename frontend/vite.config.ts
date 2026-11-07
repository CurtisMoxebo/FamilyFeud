/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');
  const frontendPort = parseInt(env.FRONTEND_PORT || env.VITE_PORT || '5173', 10);

  return {
    envDir,
    plugins: [react()],
    server: {
      port: frontendPort,
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
  };
});
