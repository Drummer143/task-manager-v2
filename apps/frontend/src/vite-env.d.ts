/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The OIDC issuer: https://auth.DOMAIN/application/o/<AUTHENTIK_SLUG>/ */
  readonly VITE_AUTHORITY: string;
  /** authentik's client id of the app (AUTHENTIK_CLIENT_ID). */
  readonly VITE_CLIENT_ID: string;
  /** Origin of main-service, e.g. https://api.DOMAIN */
  readonly VITE_API_URL: string;
  /** Origin of socket-service, e.g. https://socket.DOMAIN */
  readonly VITE_SOCKET_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
