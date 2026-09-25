import type React from 'react';
import { useRouter, type RouterAdapter } from './RouterContext';

/** Anything with a scheme (`https:`, `mailto:`…) or protocol-relative leaves the app. */
export const isExternalHref = (href: string) => /^([a-z][a-z\d+\-.]*:|\/\/)/i.test(href);

const identity = (href: string) => href;

let warnedNoRouter = false;

/**
 * The href to put on the `<a>`: passed through the adapter's `useHref`, if any.
 * The adapter is fixed for the app's lifetime, so the hook order never changes.
 */
export const useLinkHref = (href: string) => {
  const router = useRouter();
  const useHref = router?.useHref ?? identity;

  return useHref(href);
};

interface LinkClickOptions {
  href: string | undefined;
  target?: string;
  download?: boolean | string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}

/** Whether the browser, not the app router, should handle this click. */
const isBrowserClick = (
  event: React.MouseEvent<HTMLAnchorElement>,
  { href, target, download }: LinkClickOptions,
) =>
  event.defaultPrevented ||
  event.button !== 0 ||
  event.metaKey ||
  event.ctrlKey ||
  event.shiftKey ||
  event.altKey ||
  !href ||
  href.startsWith('#') ||
  isExternalHref(href) ||
  (target !== undefined && target !== '_self') ||
  (download !== undefined && download !== false);

const navigateOnClick = (
  router: RouterAdapter | null,
  event: React.MouseEvent<HTMLAnchorElement>,
  options: LinkClickOptions,
) => {
  options.onClick?.(event);

  // The owner cancelled (unsaved changes), or the browser does it better:
  // new tab / window, download, external or in-page links.
  if (!router || isBrowserClick(event, options)) {
    return;
  }

  event.preventDefault();
  router.navigate(options.href as string);
};

/**
 * The one click handler for every kit link: a plain click navigates through the
 * router without a reload; modified and middle clicks, external links,
 * `target="_blank"` and downloads are left to the browser. The caller's
 * `onClick` runs first and may `preventDefault()` to cancel the navigation.
 */
export const useLinkClick = (options: LinkClickOptions) => {
  const router = useRouter();

  if (import.meta.env.DEV && !router && options.href !== undefined && !warnedNoRouter) {
    warnedNoRouter = true;
    console.warn(
      'A kit link rendered without a router adapter: it will reload the page. ' +
        'Pass `router` to KitRoot.',
    );
  }

  return (event: React.MouseEvent<HTMLAnchorElement>) => navigateOnClick(router, event, options);
};
