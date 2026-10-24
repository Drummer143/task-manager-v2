import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { extractInstruction } from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item/extract-instruction';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview';
import {
  autoScrollForElements,
  monitorForElements,
  type DragData,
  type ElementEventBasePayload,
} from '../../interaction/dnd';
import { raw } from '../../tokens';
import { ROW_KEY, TREE_KEY, treeItemDrag } from './dnd';
import { dropTarget, isExpandable, type DropTarget, type TreeIndex, type TreeRow } from './model';
import type { TreeAccept, TreeDropPlace, TreeNode } from './types';

type NodeRow = Extract<TreeRow, { kind: 'node' }>;

interface DndOptions {
  /** This tree among others: its own rows' drags carry it. */
  treeId: string;
  containerRef: React.RefObject<HTMLElement | null>;
  rowById: ReadonlyMap<string, NodeRow>;
  index: TreeIndex;
  canMove: boolean;
  accept?: TreeAccept;
  /** A collapsed node the pointer rested on. */
  expand(id: string): void;
  /** One of the tree's own nodes dropped. */
  move(id: string, target: DropTarget): void;
}

/** A drag over the tree, or of one of its rows. */
export interface DragState {
  /** The tree's own row being dragged; null — a drag from outside. */
  sourceId: string | null;
  target: DropTarget | null;
}

const placeOf = (target: DropTarget): TreeDropPlace => ({ ...target.move, onto: target.onto });

const keyOf = (target: DropTarget | null) =>
  target ? `${target.rowId}|${target.move.parentId}|${target.move.index}|${target.line?.edge ?? 'into'}|${target.line?.depth}` : '';

/** The nearest element that scrolls vertically — the sidebar, usually. */
const scrollerOf = (element: HTMLElement | null) => {
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
  }

  return null;
};

/**
 * Dragging rows in and out of a tree (spec: Tree · 02), on pragmatic-drag-and-drop: native
 * HTML5 drag, so Esc, a drop outside and the drag image are the browser's. Each row is a
 * draggable and a drop target (TreeRow); here one monitor reads where the pointer is — the
 * hitbox's instruction on the innermost row — and turns it into a place. It hears every drag in
 * the app: the tree's own rows, and others' drags that `accept` may take.
 */
export const useTreeDnd = (options: DndOptions) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<{ node: TreeNode; container: HTMLElement } | null>(null);
  const latest = useRef(options);

  // Read by the monitor's handlers, never during render
  useLayoutEffect(() => {
    latest.current = options;
  });

  const { treeId, containerRef } = options;

  useEffect(() => {
    let hoverId: string | null = null;
    let hoverTimer: ReturnType<typeof setTimeout> | undefined;
    let targetKey = '';

    /** Where the drag points now, in this tree: the row and the place, or nothing. */
    const read = ({ source, location }: ElementEventBasePayload) => {
      const { rowById, index, canMove, accept } = latest.current;
      const item = treeItemDrag.get(source.data);
      const own = item?.tree === treeId;
      const record = location.current.dropTargets[0];
      const rowId = record?.data[TREE_KEY] === treeId ? (record.data[ROW_KEY] as string) : null;
      const row = rowId === null ? undefined : rowById.get(rowId);
      const instruction = record ? extractInstruction(record.data) : null;
      let target: DropTarget | null = null;

      if (row && instruction) {
        if (own && canMove) {
          target = dropTarget(index, row, instruction, item.node.id);
        } else if (!own && accept) {
          const place = dropTarget(index, row, instruction, null);

          target = place && accept.canDrop(source.data as DragData, placeOf(place)) ? place : null;
        }
      }

      return { own, sourceId: own ? item.node.id : null, row, target, takes: own ? canMove : accept !== undefined };
    };

    const update = (payload: ElementEventBasePayload) => {
      const { own, sourceId, row, target, takes } = read(payload);
      const rowId = row?.node.id ?? null;

      // Resting on a collapsed node opens it (--tree-hover-expand); leaving it cancels.
      if (rowId !== hoverId) {
        clearTimeout(hoverTimer);
        hoverId = rowId;

        if (row && takes && isExpandable(row.node) && !row.expanded) {
          hoverTimer = setTimeout(() => latest.current.expand(row.node.id), raw['tree-hover-expand']);
        }
      }

      // A drag from outside only matters while it is over the tree
      const next = own || row ? { sourceId, target } : null;
      const key = next ? `${sourceId}|${keyOf(target)}` : '';

      if (key !== targetKey) {
        targetKey = key;
        setDrag(next);
      }
    };

    const stop = () => {
      clearTimeout(hoverTimer);
      hoverId = null;
      targetKey = '';
      setDrag(null);
    };

    return monitorForElements({
      onDragStart: update,
      onDropTargetChange: update,
      // The instruction changes within one row as the pointer moves
      onDrag: update,
      onDrop: (payload) => {
        const { own, sourceId, target } = read(payload);

        stop();

        if (!target) {
          return;
        }

        if (own && sourceId !== null) {
          latest.current.move(sourceId, target);
        } else {
          latest.current.accept?.onDrop(payload.source.data as DragData, placeOf(target));
        }
      },
    });
  }, [treeId]);

  // Near the edge of the area the tree scrolls in, a drag scrolls it
  useEffect(() => {
    const scroller = scrollerOf(containerRef.current);

    return scroller ? autoScrollForElements({ element: scroller }) : undefined;
  }, [containerRef]);

  /**
   * The ghost: a copy of the row the browser snapshots once (spec: Tree · 02). It is rendered
   * out of the tree, so it takes the tree's density along; its surface comes from the portal.
   */
  const renderPreview = (node: TreeNode, nativeSetDragImage: Parameters<typeof setCustomNativeDragPreview>[0]['nativeSetDragImage']) =>
    setCustomNativeDragPreview({
      nativeSetDragImage,
      getOffset: pointerOutsideOfPreview({ x: `${raw['sp-3']}px`, y: `${raw['sp-2']}px` }),
      render: ({ container }) => {
        const density = containerRef.current?.closest('[data-density]')?.getAttribute('data-density');

        if (density) {
          container.setAttribute('data-density', density);
        }

        // The browser takes the snapshot as soon as this returns: the ghost must be in the DOM by then
        flushSync(() => setPreview({ node, container }));

        return () => setPreview(null);
      },
    });

  return { drag, preview, renderPreview };
};
