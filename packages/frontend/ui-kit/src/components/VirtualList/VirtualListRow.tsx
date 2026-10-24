import React, { useEffect, useRef } from 'react';
import { attachInstruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item/attach-instruction';
import { combine, draggable, dropTargetForElements, type DragData } from '../../interaction/dnd';
import type { DropEdge } from './dnd';

/** What a row asks the list, read at the moment of the drag: the latest data, not the render's. */
export interface RowControls {
  dragData(index: number): Record<string, unknown>;
  canDrop(data: DragData): boolean;
  targetData(index: number): Record<string, unknown>;
}

export interface VirtualListRowProps extends React.HTMLAttributes<HTMLElement> {
  as: 'li' | 'div';
  index: number;
  /** Drag and drop is opt-in: without either, the row is neither a draggable nor a drop target. */
  liftable: boolean;
  droppable: boolean;
  dragSource: boolean;
  dropEdge?: DropEdge;
  measure(element: HTMLElement | null): void;
  controls: React.RefObject<RowControls>;
}

/** One row of the list: measured by the virtualizer, and dragged and dropped on when the list allows it. */
export const VirtualListRow: React.FC<VirtualListRowProps> = ({
  as: Tag,
  index,
  liftable,
  droppable,
  dragSource,
  dropEdge,
  measure,
  controls,
  ...rest
}) => {
  const rowRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = rowRef.current;

    if (!element) {
      return undefined;
    }

    const registrations = [];

    if (liftable) {
      registrations.push(draggable({ element, getInitialData: () => controls.current.dragData(index) }));
    }

    if (droppable) {
      registrations.push(
        dropTargetForElements({
          element,
          canDrop: ({ source }) => controls.current.canDrop(source.data),
          getData: ({ input, element: target }) =>
            attachInstruction(controls.current.targetData(index), {
              element: target,
              input,
              axis: 'vertical',
              operations: { 'reorder-before': 'available', 'reorder-after': 'available' },
            }),
          // Over the gap between two rows the last one still holds the drop: the line does not blink
          getIsSticky: () => true,
        }),
      );
    }

    return combine(...registrations);
  }, [index, liftable, droppable, controls]);

  return (
    <Tag
      {...rest}
      ref={(element: HTMLElement | null) => {
        rowRef.current = element;
        measure(element);
      }}
      data-drag-source={dragSource || undefined}
      data-drop-edge={dropEdge}
    />
  );
};
