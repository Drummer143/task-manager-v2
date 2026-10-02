import axios, { type AxiosRequestConfig } from 'axios';

/** The HTTP client behind the generated storage functions. */
export const storageClient = axios.create();

export interface ServiceConfig {
  /** Origin of the service, e.g. `https://storage.example.com`. */
  baseUrl: string;
  /** The signed-in user's access token, read before every request. */
  getAccessToken: () => Promise<string> | string;
}

/** Points the generated storage functions at `baseUrl` and authenticates them. Returns an undo. */
export const configureStorage = ({ baseUrl, getAccessToken }: ServiceConfig) => {
  storageClient.defaults.baseURL = baseUrl.replace(/\/+$/, '');

  const id = storageClient.interceptors.request.use(async (config) => {
    config.headers.Authorization = `Bearer ${await getAccessToken()}`;

    return config;
  });

  return () => storageClient.interceptors.request.eject(id);
};

/**
 * orval's mutator: every generated storage function sends its request through this. Headers are
 * merged, so a caller adding one (e.g. `Content-Range`) keeps the generated `Content-Type`.
 */
export const storageFetcher = <T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> =>
  storageClient<T>({
    ...config,
    ...options,
    headers: { ...config.headers, ...options?.headers },
  }).then((res) => res.data);
