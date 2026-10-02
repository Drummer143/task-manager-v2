import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Written by orval (`nx run api:generate`)
    ignores: ['src/generated/**/*'],
  },
];
