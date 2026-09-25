import { useLayoutEffect, type RefObject } from 'react';

/**
 * Grows a textarea with its text, line by line, up to `maxRows` (then it
 * scrolls). No animation (spec 04): the height is set before paint, once per
 * value change — one read (scrollHeight) and one write.
 */
export const useAutoGrow = (
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  { enabled = true, maxRows }: { enabled?: boolean; maxRows?: number } = {},
) => {
  useLayoutEffect(() => {
    const textarea = ref.current;

    if (!enabled || !textarea) {
      return;
    }

    const style = getComputedStyle(textarea);
    const lineHeight = parseFloat(style.lineHeight);
    const chrome =
      parseFloat(style.paddingTop) +
      parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) +
      parseFloat(style.borderBottomWidth);
    const limit = maxRows && Number.isFinite(lineHeight) ? maxRows * lineHeight + chrome : Infinity;

    // Collapse first, or scrollHeight never shrinks when text is deleted.
    textarea.style.height = 'auto';
    const wanted = textarea.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);

    textarea.style.height = `${Math.min(wanted, limit)}px`;
    textarea.style.overflowY = wanted > limit ? 'auto' : 'hidden';
  }, [ref, value, enabled, maxRows]);
};
