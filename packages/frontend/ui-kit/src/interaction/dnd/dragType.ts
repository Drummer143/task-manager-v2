/** What a drag carries: pragmatic-drag-and-drop's `source.data`, a drop target's `data`. */
export type DragData = Record<string | symbol, unknown>;

/**
 * A kind of thing that can be dragged, with its payload typed. The source puts it into its
 * data, a drop target or a monitor elsewhere recognises it: a kit component and the app agree
 * on the type, not on the shape of the data. Several types live side by side in one drag's data
 * (the kit's own and the app's), each under its own key.
 *
 * @example
 * const pageDrag = defineDragType<{ pageId: string }>('page');
 * draggable({ element, getInitialData: () => pageDrag.data({ pageId }) });
 * dropTargetForElements({ element, canDrop: ({ source }) => pageDrag.is(source.data) });
 */
export interface DragType<T> {
  readonly name: string;
  /** The payload as drag data: for `getInitialData`, or to spread into it with others. */
  data(payload: T): Record<string, unknown>;
  /** The drag carries this type. */
  is(data: DragData): boolean;
  /** Its payload, if the drag carries this type. */
  get(data: DragData): T | undefined;
}

export const defineDragType = <T>(name: string): DragType<T> => {
  // Namespaced, so a type never takes another one's key by accident
  const key = `drag-type:${name}`;

  return {
    name,
    data: (payload) => ({ [key]: payload }),
    is: (data) => key in data,
    get: (data) => data[key] as T | undefined,
  };
};
