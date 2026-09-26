import React, { useLayoutEffect, useRef } from 'react';
import { ROW_ATTR } from './useTreeDrag';

const rowsIn = (container: HTMLElement | null) =>
  Array.from(container?.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`) ?? []);

/**
 * After a move the siblings slide into their new places (spec: Tree ·
 * animations, `transform` over --tree-move; reduced motion makes it 0).
 * `capture()` right before asking for the move remembers where every row
 * was; the next render that changes the rows plays the difference. A move the
 * app did not apply in the same frame is forgotten.
 */
export const useMoveAnimation = (containerRef: React.RefObject<HTMLElement | null>, rows: unknown) => {
  const before = useRef<Map<string, number> | null>(null);

  const capture = () => {
    const tops = new Map<string, number>();

    for (const row of rowsIn(containerRef.current)) {
      tops.set(row.getAttribute(ROW_ATTR) as string, row.getBoundingClientRect().top);
    }

    before.current = tops;
    requestAnimationFrame(() => {
      if (before.current === tops) {
        before.current = null;
      }
    });
  };

  useLayoutEffect(() => {
    const tops = before.current;

    if (!tops) {
      return;
    }

    before.current = null;

    const moved = rowsIn(containerRef.current).filter((row) => {
      const was = tops.get(row.getAttribute(ROW_ATTR) as string);
      const delta = was === undefined ? 0 : was - row.getBoundingClientRect().top;

      if (delta === 0) {
        return false;
      }

      // Back to where it was, at once…
      row.style.transition = 'none';
      row.style.transform = `translateY(${delta}px)`;

      return true;
    });

    if (moved.length === 0) {
      return;
    }

    // …then, from the next style recalculation, to where it is — by the row's own transition.
    void containerRef.current?.offsetHeight;

    for (const row of moved) {
      row.style.transition = '';
      row.style.transform = '';
    }
  }, [rows]);

  return capture;
};
