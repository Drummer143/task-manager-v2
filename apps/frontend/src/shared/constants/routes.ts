import { generatePath } from 'react-router-dom';

export const ROUTES = {
  /** Everything of a workspace lives under its slug: `/{slug}/inbox`, later `/{slug}/{pageId}`. */
  WORKSPACE: '/:workspaceSlug',
  INBOX: '/:workspaceSlug/inbox',
  LOGIN: '/login',
  CALLBACK: '/auth/callback',
} as const;

export const inboxPath = (workspaceSlug: string) => generatePath(ROUTES.INBOX, { workspaceSlug });
