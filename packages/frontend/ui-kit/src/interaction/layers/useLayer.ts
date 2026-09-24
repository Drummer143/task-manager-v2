import { useLayerStore } from './store';

/** Open / close the single overlay layer. */
export const useLayer = () => {
  const layer = useLayerStore((state) => state.layer);
  const openLayer = useLayerStore((state) => state.openLayer);
  const closeLayer = useLayerStore((state) => state.closeLayer);

  return { layer, openLayer, closeLayer, isOpen: layer !== null };
};
