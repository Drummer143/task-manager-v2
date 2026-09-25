import { createContext, useContext } from 'react';

/**
 * How the kit talks to the app's router. The kit knows no concrete router:
 * the app passes an adapter to `KitRoot`, and every kit link (Button, later
 * MenuItem, Tab, Breadcrumbs…) navigates through it.
 */
export interface RouterAdapter {
  navigate(href: string, options?: { replace?: boolean }): void;
  /** A hook that turns an app href into the real one (basename, locale prefix). */
  useHref?(href: string): string;
}

export const RouterContext = createContext<RouterAdapter | null>(null);

/** The adapter from `KitRoot`, or null — then links do full page loads. */
export const useRouter = () => useContext(RouterContext);
