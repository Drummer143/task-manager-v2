import React, { useCallback } from 'react';
import { useLayerStore } from './store';
import { useEscapeStack } from '../escape';
import { useSingleInstance } from '../../hooks/useSingleInstance';
import styles from './LayerHost.module.css';

/**
 * Renders the current overlay layer (or nothing). Place once, high in the tree.
 * While a layer is open it sits at the top of the Esc ladder — Escape closes it.
 */
export const LayerHost: React.FC = () => {
  const layer = useLayerStore((state) => state.layer);
  // One slot for the whole app: a second host would render the layer twice.
  const primary = useSingleInstance('LayerHost');
  const closeLayer = useLayerStore((state) => state.closeLayer);

  const handleEscape = useCallback(() => {
    closeLayer();
    return true;
  }, [closeLayer]);

  useEscapeStack(handleEscape, primary && layer !== null);

  if (!primary || layer === null) {
    return null;
  }

  return (
    // data-layer (DATA_ATTR_LAYER): triggers outside it get no tooltips.
    <div className={styles.layerHost} data-layer="">
      {layer}
    </div>
  );
};

export default LayerHost;
