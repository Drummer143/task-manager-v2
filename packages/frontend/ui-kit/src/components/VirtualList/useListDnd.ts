import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { extractInstruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/extract-instruction';
import { autoScrollForElements, monitorForElements, type ElementEventBasePayload } from '../../interaction/dnd';
import { INDEX_KEY, LIST_KEY, listItemDrag, reorderTarget, type ListDropTarget } from './dnd';

interface ListDndOptions {
  listId: string;
  /** Rows may be put elsewhere in the list. */
  reorderable: boolean;
  scrollElement(): Element | null;
  /** The row's place now: rows may arrive or go while it is dragged. -1 — it is gone. */
  indexOf(key: React.Key): number;
  reorder(key: React.Key, to: number): void;
}

/** A drag of one of the list's rows. */
export interface ListDragState {
  sourceKey: React.Key;
  target: ListDropTarget | null;
}

/**
 * Dragging rows of a virtual list, on pragmatic-drag-and-drop: each row is a draggable and a
 * drop target (VirtualListRow); one monitor reads the hitbox's instruction on the row under the
 * pointer and turns it into a place. It watches only the list's own rows: a row under the
 * pointer may be unmounted by a scroll, the monitor is not.
 */
export const useListDnd = (options: ListDndOptions) => {
  const [drag, setDrag] = useState<ListDragState | null>(null);
  const latest = useRef(options);

  // Read by the monitor's handlers, never during render
  useLayoutEffect(() => {
    latest.current = options;
  });

  const { listId, reorderable } = options;

  useEffect(() => {
    let stateKey = '';

    const read = ({ source, location }: ElementEventBasePayload): ListDragState | null => {
      const item = listItemDrag.get(source.data);

      if (item?.list !== listId) {
        return null;
      }

      const { reorderable: canReorder, indexOf } = latest.current;
      const from = indexOf(item.key);
      const record = location.current.dropTargets[0];
      const over = record?.data[LIST_KEY] === listId ? (record.data[INDEX_KEY] as number) : null;
      const instruction = record ? extractInstruction(record.data) : null;
      const target =
        canReorder && from >= 0 && over !== null && instruction && !instruction.blocked
          ? reorderTarget(from, over, instruction.operation)
          : null;

      return { sourceKey: item.key, target };
    };

    const update = (payload: ElementEventBasePayload) => {
      const next = read(payload);
      const key = next ? `${String(next.sourceKey)}|${next.target?.index}|${next.target?.edge}` : '';

      if (key !== stateKey) {
        stateKey = key;
        setDrag(next);
      }
    };

    return monitorForElements({
      canMonitor: ({ source }) => listItemDrag.get(source.data)?.list === listId,
      onDragStart: update,
      onDropTargetChange: update,
      // The instruction changes within one row as the pointer moves
      onDrag: update,
      onDrop: (payload) => {
        const next = read(payload);

        stateKey = '';
        setDrag(null);

        if (next?.target) {
          latest.current.reorder(next.sourceKey, next.target.to);
        }
      },
    });
  }, [listId]);

  // Near the edge of the scroller, a drag of the list's own row scrolls it
  useEffect(() => {
    const element = reorderable ? latest.current.scrollElement() : null;

    return element
      ? autoScrollForElements({
          element,
          canScroll: ({ source }) => listItemDrag.get(source.data)?.list === listId,
        })
      : undefined;
  }, [listId, reorderable]);

  return drag;
};
