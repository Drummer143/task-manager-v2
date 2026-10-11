import React, {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from 'react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import styles from './VirtualList.module.scss';
import { cx } from '../../utils';

export interface VirtualListClassNames {
  root?: string;
  listContainer?: string;
  listItemWrapper?: string;
}

/** The rows in view, without the overscan. */
export interface VirtualListRange {
  startIndex: number;
  endIndex: number;
}

export type VirtualListSemantics = 'list' | 'rows';

export interface VirtualListProps<Item> {
  /**
   * The rows. With `count`, a row whose page has not arrived is a hole (or `undefined`) at its
   * own index, so pages can land in any order: `data[5000]` may be loaded before `data[50]`.
   */
  data: ReadonlyArray<Item | undefined>;

  gap?: number;
  /**
   * The total number of rows, loaded or not, when the server tells it (offset pagination, e.g.
   * a table). Rows not loaded render `renderPlaceholder`; load the pages `onRangeChange`
   * reports. Leave it out when the total is unknown (cursor pagination, the Inbox): the list is
   * as long as `data`, `onEndReached` asks for more, `footer` shows loading or a retry.
   * Default: data.length
   */
  count?: number;
  /**
   * After the list, scrolling with it: the "Loading…" or "Couldn't load more · Retry" row of
   * a paginated list (spec Inbox 06).
   */
  footer?: React.ReactNode;
  /** Default: 2 */
  overscan?: number;
  /** Default: 'list' */
  semantics?: VirtualListSemantics;
  /** Wrapper className. Applies before classNames.wrapper */
  className?: string;
  /**
   * The keyboard cursor, by `getKey` (by index without it). Its row is scrolled into view by
   * the least shift when the cursor moves, and stays mounted while scrolled away, so the focus
   * it holds is not dropped to `body`. A key not in `data` (not loaded yet) is ignored.
   */
  cursorKey?: React.Key;
  classNames?: VirtualListClassNames;
  /** Default: 0 */
  fixedHeight?: number;
  /** Default: 50 */
  estimateSize?: number | ((index: number) => number);
  scrollMargin?: number;
  endThreshold?: number;

  /** `index` is the row's place in `data` (0-based): a grid's aria-rowindex, a list's own numbering. */
  renderItem: (item: Item, index: number) => React.ReactNode;

  getKey?: (item: Item) => React.Key;
  /** The last loaded row came within `endThreshold` rows of the view: once per `data.length`. */
  onEndReached?: () => void;
  /** The rows in view changed: with `count`, the place to load what the user looks at. */
  onRangeChange?: (range: VirtualListRange) => void;
  /** If provided, the list will be rendered inside the provided element instead of the wrapper */
  getScrollElement?: () => Element | null;
  /** A row not loaded yet (a hole in `data`, or past its end), e.g. a skeleton line. */
  renderPlaceholder?: (index: number) => React.ReactNode;
}

export const VirtualList = <Item,>({
  data,
  gap,
  count = data.length,
  getKey,
  cursorKey,
  overscan = 2,
  semantics = 'list',
  className,
  classNames,
  renderItem,
  renderPlaceholder,
  footer,
  fixedHeight = 0,
  estimateSize = 50,
  scrollMargin,
  endThreshold = 0,
  onEndReached,
  onRangeChange,
  getScrollElement,
}: VirtualListProps<Item>) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cursorIndex =
    cursorKey === undefined
      ? -1
      : getKey
        ? data.findIndex(
            (item) => item !== undefined && getKey(item) === cursorKey,
          )
        : typeof cursorKey === 'number' && data[cursorKey] !== undefined
          ? cursorKey
          : -1;

  const virtualizer = useVirtualizer({
    gap,
    count,
    overscan,
    anchorTo: 'end',
    scrollMargin,
    directDomUpdates: true,
    // A placeholder has no item to take a key from; its own key cannot clash with an item's
    getItemKey: (index) => {
      const item = data[index];

      if (item === undefined) return `\u0000placeholder:${index}`;

      return getKey ? getKey(item) : index;
    },
    measureElement: fixedHeight ? () => fixedHeight : undefined,
    getScrollElement: getScrollElement ?? (() => wrapperRef.current),
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);

      if (cursorIndex >= 0 && !indexes.includes(cursorIndex)) {
        indexes.push(cursorIndex);
        indexes.sort((a, b) => a - b);
      }

      return indexes;
    },
    estimateSize: fixedHeight
      ? () => fixedHeight
      : typeof estimateSize === 'number'
        ? () => estimateSize
        : estimateSize,
  });

  const revealCursor = useEffectEvent(() => {
    if (cursorIndex >= 0) {
      virtualizer.scrollToIndex(cursorIndex, { align: 'auto' });
    }
  });

  // When the cursor moves, not when the rows around it change
  useLayoutEffect(() => revealCursor(), [cursorKey]);

  const start = virtualizer.range?.startIndex ?? -1;
  const end = virtualizer.range?.endIndex ?? -1;
  const loaded = data.length;
  const reported = useRef(-1);

  const reportReachEnd = useEffectEvent(() => onEndReached?.());
  const reportRange = useEffectEvent(() =>
    onRangeChange?.({ startIndex: start, endIndex: end }),
  );

  // The end of what is loaded, not of `count`: with placeholders after it, that is where more is
  // needed. Once per length, so a page in flight is not asked for again
  useEffect(() => {
    if (count === 0 || end < loaded - 1 - endThreshold) return;

    if (reported.current === loaded) return;

    reported.current = loaded;

    reportReachEnd();
  }, [count, end, endThreshold, loaded]);

  useEffect(() => {
    if (end >= 0) {
      reportRange();
    }
  }, [start, end]);

  const listItemClassName = cx(
    styles.listItemWrapper,
    classNames?.listItemWrapper,
  );

  const asList = semantics === 'list';
  const ListTag = asList ? 'ul' : 'div';
  const ItemTag = asList ? 'li' : 'div';

  const list = (
    <ListTag
      // role="list" survives `list-style: none` in Safari / VoiceOver
      role={asList ? 'list' : 'rowgroup'}
      ref={virtualizer.containerRef}
      className={cx(styles.listContainer, classNames?.listContainer)}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = data[virtualItem.index];
        const isPlaceholder = item === undefined;

        return (
          <ItemTag
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            className={listItemClassName}
            data-index={virtualItem.index}
            role={asList ? undefined : 'none'}
            aria-setsize={asList ? count : undefined}
            aria-posinset={asList ? virtualItem.index + 1 : undefined}
            aria-busy={isPlaceholder || undefined}
          >
            {isPlaceholder
              ? renderPlaceholder?.(virtualItem.index)
              : renderItem(item, virtualItem.index)}
          </ItemTag>
        );
      })}
    </ListTag>
  );

  if (getScrollElement) {
    return (
      <>
        {list}
        {footer}
      </>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className={cx(styles.root, className, classNames?.root)}
    >
      {list}
      {footer}
    </div>
  );
};
