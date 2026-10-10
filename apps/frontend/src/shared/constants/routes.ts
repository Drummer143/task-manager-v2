import { generatePath } from 'react-router-dom';

export const ROUTES = {
  /** Everything of a space lives under its id: `/{ws}/inbox`, later `/{ws}/{pageId}`. */
  WORKSPACE: '/:workspace',
  INBOX: '/:workspace/inbox',
  LOGIN: '/login',
  CALLBACK: '/auth/callback',
} as const;

/**
 * The space the app opens in when the address has none (`/`, an unknown path). For now the nil
 * uuid; later the active one kept in localStorage, else the first from `/me`.
 */
export const NIL_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export const defaultWorkspaceId = () => NIL_WORKSPACE_ID;

export const inboxPath = (workspace: string) => generatePath(ROUTES.INBOX, { workspace });
