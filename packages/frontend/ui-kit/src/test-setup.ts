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

/*
 * Nor PointerEvent: testing-library then fires a bare Event and drops clientX,
 * so a drag cannot be told from a click. A MouseEvent carries the coordinates.
 */
if (typeof globalThis.PointerEvent === 'undefined') {
  globalThis.PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  } as unknown as typeof globalThis.PointerEvent;
}
