/**
 * Design tokens — public API.
 *
 * Source of truth is tokens.css. Everything else here is generated from it
 * (tokens.generated.ts). Components import from here, not from generated.
 *
 *   import { cssVar, token, raw } from '@task-manager-v2/ui-kit';
 *
 *   style={{ color: token['text-primary'] }}          // 'var(--text-primary)'
 *   style={{ color: cssVar('text-primary') }}          // same, with name checking
 *   setTimeout(fn, raw['spinner-delay']);              // 200 (ms, number)
 */
export {
  TOKENS,
  PRIMITIVE_TOKENS,
  token,
  raw,
  rawUnit,
  type TokenName,
  type PrimitiveToken,
  type RawTokenName,
} from './tokens.generated';

import { token, type TokenName } from './tokens.generated';

/** Type-safe CSS variable reference: cssVar('bg-canvas') → 'var(--bg-canvas)'. */
export function cssVar(name: TokenName): string {
  return token[name];
}
