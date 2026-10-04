/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * certs/ from scripts/generate-certs.ps1, when present. authentik only redirects back to
 * registered URLs, and the one for local development is https://localhost:1346.
 */
function devCertificates() {
  const dir = join(import.meta.dirname, '../../certs');
  const key = join(dir, 'localhost-key.pem');
  const cert = join(dir, 'localhost.pem');
  return existsSync(key) && existsSync(cert) ? { key: readFileSync(key), cert: readFileSync(cert) } : undefined;
}

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/frontend',
  server: {
    port: 1346,
    host: 'localhost',
    // e2e (apps/frontend-e2e) fakes authentik, so it needs no registered URL: plain http, the same
    // locally and in CI
    https: process.env['E2E'] ? undefined : devCertificates(),
  },
  preview: {
    port: 2346,
    host: 'localhost',
  },
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  // The upload worker (@task-manager-v2/uploader) imports workspace libs, and workers are bundled
  // separately, so they need the path aliases too
  worker: {
    format: 'es' as const,
    plugins: () => [nxViteTsPaths()],
  },
  build: {
    outDir: '../../dist/apps/frontend',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'frontend',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/frontend',
      provider: 'v8' as const,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{spec,test}.{ts,tsx}',
        'src/**/*.stories.{ts,tsx}',
        'src/**/index.ts',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/test-setup.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      // Current level, rounded down. Raise when coverage grows; never lower silently.
      thresholds: {
        statements: 87,
        branches: 94,
        functions: 80,
        lines: 86,
      },
    },
  },
}));
