import baseConfig from '../../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // Written by wasm-bindgen (`nx run blake3-wasm:build-wasm`)
    ignores: ['src/hasher/wasm/**/*'],
  },
];
