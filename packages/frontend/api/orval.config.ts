import { defineConfig } from 'orval';

// Specs come from the services: `nx run storage:export-openapi` writes specs/openapi-storage.json.
// main-service has no OpenAPI yet; it gets its own block here once it does.
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
});
