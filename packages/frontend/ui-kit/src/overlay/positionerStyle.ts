import type { CSSProperties } from 'react';
import { cssVar, type TokenName } from '../tokens';

/**
 * Zag's positioner style, with the layer set by the kit. Zag writes
 * `z-index: var(--z-index)` and fills that variable itself only sometimes;
 * the kit's z-index is an enumeration (tokens 05), so it is set here, explicitly.
 */
export const positionerStyle = (style: CSSProperties | undefined, layer: TokenName = 'z-dropdown'): CSSProperties => ({
  ...style,
  zIndex: cssVar(layer),
});
