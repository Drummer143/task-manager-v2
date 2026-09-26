import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { raw } from '../../tokens';
import type { DropTarget } from './model';

/** The data attribute every node row carries: its id. */
export const ROW_ATTR = 'data-tree-row';

interface DragOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  /** The drop a point on a row means (`fraction` — how far down the row, 0…1). */
  targetAt(draggedId: string, rowId: string, fraction: number): DropTarget | null;
  /** A collapsed node that opens when the pointer rests on it. */
  opensOnHover(rowId: string): boolean;
  expand(rowId: string): void;
  drop(id: string, target: DropTarget): void;
}

export interface DragState {
  id: string;
  target: DropTarget | null;
  /** The source row's width: the ghost keeps it. */
  width: number;
}

interface Session {
  id: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Where on the row it was grabbed: the ghost keeps that horizontal offset. */
  grabX: number;
  width: number;
  active: boolean;
  target: DropTarget | null;
  targetKey: string;
  hoverId: string | null;
  hoverTimer?: ReturnType<typeof setTimeout>;
  frame?: number;
  cleanup(): void;
}

/** How far the ghost sits from the pointer: past the bottom quarter of a row, where an "after" line is drawn. */
const GHOST_SHIFT_X = 2 * raw['tree-indent'];
const GHOST_SHIFT_Y = raw['sp-4'];

const keyOf =(target: DropTarget | null) =>
  target ? `${target.rowId}|${target.move.parentId}|${target.move.index}|${target.line?.edge ?? 'into'}` : '';

/** The nearest element that scrolls vertically — the sidebar, usually. */
const scrollerOf = (element: HTMLElement | null) => {
  for (let node = element; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);

    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }

  return null;
};

/** The click that ends a drag is not a click on the row. */
const swallowNextClick = () => {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };

  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
};

/**
 * Dragging tree rows with the pointer (spec: Tree · 02). A press becomes a drag
 * after --drag-threshold; the ghost follows the pointer with no delay (its
 * position is written to the DOM — moving it renders nothing); React only
 * hears about a change of the drop target. Near the scroll area's edge the
 * list scrolls linearly; resting on a collapsed node opens it after
 * --tree-hover-expand; Esc or a drop outside cancels.
 */
export const useTreeDrag = (options: DragOptions) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const session = useRef<Session | null>(null);
  const latest = useRef(options);

  latest.current = options;

  const placeGhost = () => {
    const current = session.current;

    if (current && ghostRef.current) {
      // Below and to the right of the pointer: the row under it and the insertion line stay in sight.
      const x = current.x - current.grabX + GHOST_SHIFT_X;
      const y = current.y + GHOST_SHIFT_Y;

      ghostRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  };

  const retarget = () => {
    const current = session.current;

    if (!current) {
      return;
    }

    const element = document.elementFromPoint?.(current.x, current.y)?.closest<HTMLElement>(`[${ROW_ATTR}]`);
    const inside = element && latest.current.containerRef.current?.contains(element);
    const rowId = inside ? (element.getAttribute(ROW_ATTR) as string) : null;
    let target: DropTarget | null = null;

    if (rowId !== null && element) {
      const rect = element.getBoundingClientRect();

      target = latest.current.targetAt(current.id, rowId, rect.height > 0 ? (current.y - rect.top) / rect.height : 0.5);
    }

    if (rowId !== current.hoverId) {
      clearTimeout(current.hoverTimer);
      current.hoverId = rowId;

      if (rowId !== null && latest.current.opensOnHover(rowId)) {
        current.hoverTimer = setTimeout(() => latest.current.expand(rowId), raw['tree-hover-expand']);
      }
    }

    const key = keyOf(target);

    if (key !== current.targetKey) {
      current.targetKey = key;
      current.target = target;
      setDrag((state) => state && { ...state, target });
    }
  };

  const autoscroll = () => {
    const current = session.current;

    if (!current?.active) {
      return;
    }

    const scroller = scrollerOf(latest.current.containerRef.current);

    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const zone = raw['drag-autoscroll-zone'];
      const step = raw['drag-autoscroll-step'];
      const delta = current.y < rect.top + zone ? -step : current.y > rect.bottom - zone ? step : 0;
      const before = scroller.scrollTop;

      if (delta !== 0) {
        scroller.scrollTop = before + delta;

        if (scroller.scrollTop !== before) {
          retarget();
        }
      }
    }

    current.frame = requestAnimationFrame(autoscroll);
  };

  const end = (commit: boolean) => {
    const current = session.current;

    if (!current) {
      return;
    }

    current.cleanup();
    session.current = null;

    if (current.active) {
      swallowNextClick();
      setDrag(null);

      if (commit && current.target) {
        latest.current.drop(current.id, current.target);
      }
    }
  };

  const start = (event: React.PointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || session.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const onMove = (move: PointerEvent) => {
      const current = session.current;

      if (!current) {
        return;
      }

      current.x = move.clientX;
      current.y = move.clientY;

      if (!current.active) {
        if (Math.hypot(current.x - current.startX, current.y - current.startY) < raw['drag-threshold']) {
          return;
        }

        current.active = true;
        setDrag({ id: current.id, target: null, width: current.width });
        current.frame = requestAnimationFrame(autoscroll);
      }

      placeGhost();
      retarget();
    };

    const onUp = () => end(true);
    const onCancel = () => end(false);

    const onKey = (key: KeyboardEvent) => {
      // Esc cancels the drag, and only that: the Esc ladder does not see it.
      if (key.key === 'Escape' && session.current?.active) {
        key.preventDefault();
        key.stopPropagation();
        end(false);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, { capture: true });

    session.current = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      grabX: event.clientX - rect.left,
      width: rect.width,
      active: false,
      target: null,
      targetKey: '',
      hoverId: null,
      cleanup: () => {
        const current = session.current;

        clearTimeout(current?.hoverTimer);

        if (current?.frame !== undefined) {
          cancelAnimationFrame(current.frame);
        }

        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onCancel);
        window.removeEventListener('keydown', onKey, { capture: true });
      },
    };
  };

  // The ghost is born under the pointer, not at the corner of the window.
  useLayoutEffect(placeGhost, [drag?.id]);

  useEffect(() => () => session.current?.cleanup(), []);

  return { drag, ghostRef, start };
};
