import { defineConfig } from 'orval';

// Specs come from the services' code: `nx run storage:export-openapi` writes
// specs/openapi-storage.json, `nx run main_service:export-openapi` writes specs/openapi-main.json.
export default defineConfig({
  storage: {
    input: {
      target: './specs/openapi-storage.json',
    },
    output: {
      target: './src/generated/storage/index.ts',
      schemas: './src/generated/storage/schemas',
      client: 'axios-functions',
      mode: 'split',
      clean: true,
      // storage has its own origin, set at runtime with `configureStorage`
      override: {
        mutator: {
          path: './src/fetcher.ts',
          name: 'storageFetcher',
        },
      },
    },
  },
  main: {
    input: {
      target: './specs/openapi-main.json',
    },
    output: {
      target: './src/generated/main/index.ts',
      schemas: './src/generated/main/schemas',
      client: 'axios-functions',
      mode: 'split',
      clean: true,
      // main-service has its own origin, set at runtime with `configureMain`
      override: {
        mutator: {
          path: './src/fetcher.ts',
          name: 'mainFetcher',
        },
      },
    },
  },
});
