import { test as base, expect } from '@playwright/test';
import { type FakeApi, fakeApi } from './api';
import { DEFAULT_IDENTITY, type FakeIdentity, fakeAuthentik, restoreSession } from './authentik';
import { type FakeRealtime, fakeRealtime } from './realtime';

interface Options {
  /** Who authentik signs in, and whose session `signedIn` restores. */
  identity: FakeIdentity;
  /** Start with a session from an earlier sign-in, as after a reload. */
  signedIn: boolean;
}

interface Fixtures {
  authentik: Awaited<ReturnType<typeof fakeAuthentik>>;
  api: FakeApi;
  realtime: FakeRealtime;
}

/**
 * Every test runs against the fakes: authentik, main-service and socket-service are answered
 * inside the browser, and anything else that is not the app itself is cut off.
 */
export const test = base.extend<Options & Fixtures>({
  identity: [DEFAULT_IDENTITY, { option: true }],
  signedIn: [false, { option: true }],

  // The page itself cuts off everything but the app before any fake is set up: routes
  // registered later take precedence, so the fakes answer first
  page: async ({ page }, use) => {
    const stray: string[] = [];
    await page.route(
      (url) => url.hostname !== 'localhost',
      (route) => {
        stray.push(`${route.request().method()} ${route.request().url()}`);
        return route.abort('blockedbyclient');
      },
    );
    await use(page);
    // eslint-disable-next-line playwright/no-standalone-expect -- a fixture's teardown runs as part of the test
    expect(stray, 'requests outside the fakes').toEqual([]);
  },

  authentik: [
    async ({ page, identity, signedIn }, use) => {
      if (signedIn) await restoreSession(page, identity);
      await use(await fakeAuthentik(page, identity));
    },
    { auto: true },
  ],

  api: [
    async ({ page }, use) => {
      const api = await fakeApi(page);
      await use(api);
      expect(api.unhandled, 'API calls without an answer set up').toEqual([]);
    },
    { auto: true },
  ],

  realtime: [async ({ page }, use) => use(await fakeRealtime(page)), { auto: true }],
});

export { expect };
