import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';
import { APP_ORIGIN, APP_PORT, appEnv } from './src/support/env';

/**
 * The app runs on its own port with the services pointed at the fakes in src/support, so the
 * suite needs nothing but itself: no authentik, no backend, no VPS. See src/support/fixtures.ts.
 */
export default defineConfig({
  ...nxE2EPreset(__dirname, { testDir: './src' }),
  use: {
    baseURL: APP_ORIGIN,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `pnpm exec nx run frontend:dev --port=${APP_PORT} --strictPort`,
    url: APP_ORIGIN,
    // Only a server of this suite: one started by hand with other settings would see the real
    // services
    reuseExistingServer: false,
    cwd: workspaceRoot,
    env: appEnv,
    timeout: 120_000,
  },
  // Chromium only for now: the fakes are the point of the suite, not browser differences
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
