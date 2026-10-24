import React, { useEffect, useEffectEvent, useId, useLayoutEffect, useRef } from 'react';
import { announce } from '@atlaskit/pragmatic-drag-and-drop-live-region';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import styles from './VirtualList.module.scss';
import { cx } from '../../utils';
import { useMessages } from '../../messages';
import { INDEX_KEY, LIST_KEY, listItemDrag } from './dnd';
import { useListDnd } from './useListDnd';
import { VirtualListRow, type RowControls } from './VirtualListRow';

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
  /**
   * Drag a row to another place in the list: `key` (by `getKey`, which reordering needs), `to`
   * — its index in the list as it will be. Optimistic: the app updates `data`, and offers the
   * same move from the keyboard. Placeholders are neither dragged nor dropped on.
   */
  onReorder?: (key: React.Key, to: number) => void;
  /**
   * More data for a dragged row, next to the kit's own (`listItemDrag`): the app's types
   * (`defineDragType`), for its drop targets elsewhere. Rows are lifted only with this or
   * `onReorder`: without both, the list has no drag and drop.
   */
  dragData?: (item: Item) => Record<string, unknown>;
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
  onReorder,
  dragData,
}: VirtualListProps<Item>) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const messages = useMessages();

  /** A loaded row's index by its key (by index without `getKey`); -1 when it is not loaded. */
  const indexOf = (key: React.Key) =>
    getKey
      ? data.findIndex((item) => item !== undefined && getKey(item) === key)
      : typeof key === 'number' && data[key] !== undefined
        ? key
        : -1;

  const keyOf = (index: number) => {
    const item = data[index];

    return getKey && item !== undefined ? getKey(item) : index;
  };

  const drag = useListDnd({
    listId,
    reorderable: onReorder !== undefined,
    scrollElement: () => getScrollElement?.() ?? wrapperRef.current,
    indexOf,
    reorder: (key, to) => {
      onReorder?.(key, to);
      announce(messages.listMoved(to + 1, count));
    },
  });

  const controls = useRef<RowControls>(null!);

  useLayoutEffect(() => {
    controls.current = {
      dragData: (index) => {
        const item = data[index] as Item;

        // The app's own types first: the kit's key is never overwritten
        return { ...dragData?.(item), ...listItemDrag.data({ list: listId, key: keyOf(index), index }) };
      },
      canDrop: (source) => onReorder !== undefined && listItemDrag.get(source)?.list === listId,
      targetData: (index) => ({ [LIST_KEY]: listId, [INDEX_KEY]: index }),
    };
  });

  const cursorIndex = cursorKey === undefined ? -1 : indexOf(cursorKey);
  // A dragged row scrolled out of view stays mounted: its drag ends on it
  const sourceIndex = drag ? indexOf(drag.sourceKey) : -1;
  const liftable = onReorder !== undefined || dragData !== undefined;
  const droppable = onReorder !== undefined;

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

      for (const pinned of [cursorIndex, sourceIndex]) {
        if (pinned >= 0 && !indexes.includes(pinned)) {
          indexes.push(pinned);
        }
      }

      return indexes.sort((a, b) => a - b);
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
      style={{ '--_gap': `${gap ?? 0}px` } as React.CSSProperties}
      data-dragging={drag ? '' : undefined}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = data[virtualItem.index];
        const isPlaceholder = item === undefined;

        const target = drag?.target;

        return (
          <VirtualListRow
            as={ItemTag}
            key={virtualItem.key}
            index={virtualItem.index}
            liftable={liftable && !isPlaceholder}
            droppable={droppable && !isPlaceholder}
            dragSource={sourceIndex === virtualItem.index}
            dropEdge={target?.index === virtualItem.index ? target.edge : undefined}
            measure={virtualizer.measureElement}
            controls={controls}
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
          </VirtualListRow>
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
