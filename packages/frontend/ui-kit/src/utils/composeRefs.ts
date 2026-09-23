import type { Ref, RefCallback } from 'react';

/** One ref callback that feeds every given ref — for elements that receive two. */
export const composeRefs =
  <T>(...refs: (Ref<T> | undefined)[]): RefCallback<T> =>
  (node) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }
  };
