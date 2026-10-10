import React, { useCallback, useLayoutEffect, useRef } from 'react';
import {
  raw,
  useCursorStore,
  useRegisterHotkey,
  VirtualList,
} from '@task-manager-v2/ui-kit';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import styles from '../Inbox.module.scss';

export const inboxRowId = (id: string) => `inbox-row-${id}`;

const ROW_ID_PREFIX = inboxRowId('');

const getKey = (item: Notification) => item.id;

export interface InboxListProps {
  items: readonly Notification[];

  footer?: React.ReactNode;
  /** More pages to come: the row count is not known yet (aria-rowcount -1). */
  hasMore?: boolean;

  renderItem: (item: Notification, index: number) => React.ReactNode;
  onEndReached: () => void;
}

export const InboxList: React.FC<InboxListProps> = ({
  items,
  footer,
  hasMore = false,
  renderItem,
  onEndReached
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  const cursor = useCursorStore((state) => state.cursor);

  const getScrollElement = useCallback(() => listRef.current, []);

  useLayoutEffect(() => {
    const { cursor: current, setCursor } = useCursorStore.getState();

    if (!items.some((item) => item.id === current)) {
      setCursor(items[0]?.id ?? null);
    }
  }, [items]);

  const move = (delta: number) => {
    const { cursor: current, setCursor } = useCursorStore.getState();
    const index = items.findIndex((item) => item.id === current);
    const next = items[Math.min(Math.max(index + delta, 0), items.length - 1)];

    if (next) {
      setCursor(next.id);
    }
  };

  // The registry calls the latest callback, so `move` sees the current items
  useRegisterHotkey({
    key: 'j',
    description: 'Next notification',
    callback: () => move(1),
  });
  useRegisterHotkey({
    key: 'k',
    description: 'Previous notification',
    callback: () => move(-1),
  });
  // The arrows too, anywhere on the page (spec 08): a widget that takes its own arrows (the
  // tree, a radio group, a menu) handles them first, and the registry leaves a handled key
  useRegisterHotkey({
    key: 'ArrowDown',
    description: 'Next notification',
    callback: () => move(1),
  });
  useRegisterHotkey({
    key: 'ArrowUp',
    description: 'Previous notification',
    callback: () => move(-1),
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Home and End only while the list has focus: elsewhere they scroll the page
    const deltas: Record<string, number> = {
      Home: -items.length,
      End: items.length,
    };
    const delta = deltas[event.key];

    if (
      delta === undefined ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    move(delta);
  };

  return (
    <div
      ref={listRef}
      role="grid"
      aria-label="Notifications"
      aria-rowcount={hasMore ? -1 : items.length}
      tabIndex={0}
      aria-activedescendant={cursor ? inboxRowId(cursor) : undefined}
      className={styles.grid}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        listRef.current?.focus({ preventScroll: true });

        const row = (event.target as Element).closest<HTMLElement>(
          '[role="row"]',
        );

        if (row?.id.startsWith(ROW_ID_PREFIX)) {
          useCursorStore
            .getState()
            .setCursor(row.id.slice(ROW_ID_PREFIX.length));
        }
      }}
    >
      <VirtualList
        semantics="rows"
        data={items}
        getKey={getKey}
        cursorKey={cursor ?? undefined}
        getScrollElement={getScrollElement}
        renderItem={renderItem}
        estimateSize={raw['inbox-row']}
        onEndReached={onEndReached}
        footer={footer}
        endThreshold={10}
      />
    </div>
  );
};
