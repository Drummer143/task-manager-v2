/**
 * This tab, for main-service: sent as `X-Client-Id` with every request and returned in the
 * `origin` of the signals the request caused, so the tab skips its own echo.
 */
export const CLIENT_ID = crypto.randomUUID();

export const CLIENT_ID_HEADER = 'X-Client-Id';
