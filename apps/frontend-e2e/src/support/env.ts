/**
 * Where the app under test looks for its services. The `.test` hosts never resolve: every
 * request to them is answered inside the browser by the fakes in this folder, and nothing
 * leaves the machine.
 */

export const APP_PORT = 4310;
export const APP_ORIGIN = `http://localhost:${APP_PORT}`;

export const AUTHORITY = 'https://auth.example.test/application/o/example/';
export const CLIENT_ID = 'example-e2e';
export const API_ORIGIN = 'https://api.example.test';
export const SOCKET_ORIGIN = 'https://socket.example.test';

/** The build-time settings of the app (see apps/frontend/src/vite-env.d.ts). */
export const appEnv = {
  // apps/frontend/vite.config.mts: plain http instead of the local certificates
  E2E: '1',
  VITE_AUTHORITY: AUTHORITY,
  VITE_CLIENT_ID: CLIENT_ID,
  VITE_API_URL: API_ORIGIN,
  VITE_SOCKET_URL: SOCKET_ORIGIN,
};
