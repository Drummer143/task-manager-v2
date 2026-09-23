import { useCallback } from 'react';
import { useLayerStore } from './store';
import { useEscapeStack } from '../escape';
import styles from './LayerHost.module.css';

/**
 * Renders the current overlay layer (or nothing). Place once, high in the tree.
 * While a layer is open it sits at the top of the Esc ladder — Escape closes it.
 */
export function LayerHost() {
  const layer = useLayerStore((state) => state.layer);
  const closeLayer = useLayerStore((state) => state.closeLayer);

  const handleEscape = useCallback(() => {
    closeLayer();
    return true;
  }, [closeLayer]);

  useEscapeStack(handleEscape, layer !== null);

  if (layer === null) {
    return null;
  }

  return <div className={styles.layerHost}>{layer}</div>;
}

export default LayerHost;
