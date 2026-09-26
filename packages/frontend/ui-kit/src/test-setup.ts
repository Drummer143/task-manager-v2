/*
 * jsdom has no layout, so it has no ResizeObserver either. Overlay
 * positioning (Zag → floating-ui) watches sizes with it; in tests nothing
 * resizes, so an observer that never fires is the honest stand-in.
 */
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}
