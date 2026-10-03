import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

/** The HTTP client behind the generated storage functions. */
export const storageClient = axios.create();

/** The HTTP client behind the generated main-service functions. */
export const mainClient = axios.create();

export interface ServiceConfig {
  /** Origin of the service, e.g. `https://storage.example.com`. */
  baseUrl: string;
  /** The signed-in user's access token, read before every request. */
  getAccessToken: () => Promise<string> | string;
}

/**
 * Points `client` at `baseUrl` and authenticates it. A request that brings its own
 * `Authorization` keeps it (a token fresh from the sign-in callback). Returns an undo.
 */
const configure = (client: AxiosInstance, { baseUrl, getAccessToken }: ServiceConfig) => {
  client.defaults.baseURL = baseUrl.replace(/\/+$/, '');

  const id = client.interceptors.request.use(async (config) => {
    if (!config.headers.Authorization) config.headers.Authorization = `Bearer ${await getAccessToken()}`;

    return config;
  });

  return () => client.interceptors.request.eject(id);
};

/** Headers are merged, so a caller adding one (e.g. `Content-Range`) keeps the generated `Content-Type`. */
const send = <T>(client: AxiosInstance, config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> =>
  client<T>({
    ...config,
    ...options,
    headers: { ...config.headers, ...options?.headers },
  }).then((res) => res.data);

/** Points the generated storage functions at `baseUrl` and authenticates them. Returns an undo. */
export const configureStorage = (config: ServiceConfig) => configure(storageClient, config);

/** Points the generated main-service functions at `baseUrl` and authenticates them. Returns an undo. */
export const configureMain = (config: ServiceConfig) => configure(mainClient, config);

// orval reads the mutators' parameter lists to give the generated functions an `options`
// argument: keep them spelled out here, not built by a factory

/** orval's mutator: every generated storage function sends its request through this. */
export const storageFetcher = <T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> =>
  send<T>(storageClient, config, options);

/** orval's mutator: every generated main-service function sends its request through this. */
export const mainFetcher = <T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> =>
  send<T>(mainClient, config, options);
