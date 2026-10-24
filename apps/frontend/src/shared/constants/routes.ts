import { generatePath } from 'react-router-dom';

export const ROUTES = {
  /** Everything of a workspace lives under its slug: `/{slug}/inbox`, `/{slug}/p/{shortId}`. */
  WORKSPACE: '/:workspaceSlug',
  INBOX: '/:workspaceSlug/inbox',
  /** A page by its short id: the title is not in the address, a rename breaks no link. */
  PAGE: '/:workspaceSlug/p/:shortId',
  LOGIN: '/login',
  CALLBACK: '/auth/callback',
} as const;

export const inboxPath = (workspaceSlug: string) => generatePath(ROUTES.INBOX, { workspaceSlug });

export const pagePath = (workspaceSlug: string, shortId: string) =>
  generatePath(ROUTES.PAGE, { workspaceSlug, shortId });
