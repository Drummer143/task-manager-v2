import type React from 'react';
import type { Instruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item';
import { defineDragType } from '../../interaction/dnd';

/** A dragged row: which list, which row, where it was when lifted. */
export interface ListDragItem {
  list: string;
  key: React.Key;
  index: number;
}

/**
 * A dragged list row, for the app's drop targets and monitors:
 * `listItemDrag.is(source.data)`, `listItemDrag.get(source.data)?.key`.
 */
export const listItemDrag = defineDragType<ListDragItem>('list-item');

/** A row's drop target data: which list, which row. */
export const LIST_KEY = 'virtual-list';
export const INDEX_KEY = 'virtual-list-index';

export type DropEdge = 'top' | 'bottom';

export interface ListDropTarget {
  /** The row that shows the line, and at which edge. */
  index: number;
  edge: DropEdge;
  /** Where the dragged row lands, counted in the list as it will be. */
  to: number;
}

/**
 * The place the hitbox's instruction over row `over` means for the row at `from`, or null
 * where it already is. The rows after the dragged one move up by one once it is taken out.
 */
export const reorderTarget = (from: number, over: number, operation: Instruction['operation']): ListDropTarget | null => {
  if (operation === 'combine') {
    return null;
  }

  const before = operation === 'reorder-before';
  const place = before ? over : over + 1;
  const to = from < place ? place - 1 : place;

  return to === from ? null : { index: over, edge: before ? 'top' : 'bottom', to };
};
