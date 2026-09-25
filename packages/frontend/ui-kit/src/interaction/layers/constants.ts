/**
 * Marks the root of an open overlay — the layer, and later menus, popovers and
 * dialogs. Whatever is outside the topmost one is "under a layer": the tooltip
 * host stays silent for its triggers (spec 10).
 */
export const DATA_ATTR_LAYER = 'data-layer';
export const LAYER_SELECTOR = `[${DATA_ATTR_LAYER}]`;

/** The topmost open overlay: later in the DOM paints above (same z level). */
export const topmostLayer = (root: ParentNode = document): Element | null => {
  const layers = root.querySelectorAll(LAYER_SELECTOR);

  return layers.length > 0 ? layers[layers.length - 1] : null;
};

/** Whether an element is covered by an open overlay it does not belong to. */
export const isUnderLayer = (element: Element) => {
  const layer = topmostLayer(element.ownerDocument);

  return layer !== null && !layer.contains(element);
};
