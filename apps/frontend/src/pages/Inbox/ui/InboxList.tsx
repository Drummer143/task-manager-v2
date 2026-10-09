import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useCursorStore, useRegisterHotkey, VirtualList, type HotkeyHandlerConfig } from '@task-manager-v2/ui-kit';
import type { Notification } from '@task-manager-v2/api/main/schemas';
import styles from '../Inbox.module.scss';

export const inboxRowId = (id: string) => `inbox-row-${id}`;

const ROW_ID_PREFIX = inboxRowId('');

const getKey = (item: Notification) => item.id;

export interface InboxListProps {
  items: readonly Notification[];

  renderItem(item: Notification, index: number): React.ReactNode;
  /** More pages to come: the row count is not known yet (aria-rowcount -1). */
  hasMore?: boolean;
}

export const InboxList: React.FC<InboxListProps> = ({ items, renderItem, hasMore = false }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const cursor = useCursorStore((state) => state.cursor);

  useLayoutEffect(() => {
    const { cursor: current, setCursor } = useCursorStore.getState();

    if (!items.some((item) => item.id === current)) {
      setCursor(items[0]?.id ?? null);
    }
  }, [items]);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const hotkeys = useMemo(() => {
    const move = (delta: number) => {
      const list = itemsRef.current;
      const { cursor: current, setCursor } = useCursorStore.getState();
      const index = list.findIndex((item) => item.id === current);
      const next = list[Math.min(Math.max(index + delta, 0), list.length - 1)];

      if (next) {
        setCursor(next.id);
      }
    };

    const config = (key: string, description: string, delta: number): HotkeyHandlerConfig => ({
      key,
      description,
      callback: () => move(delta),
    });

    return {
      move,
      next: config('j', 'Next notification', 1),
      previous: config('k', 'Previous notification', -1),
      // The arrows too, anywhere on the page (spec 08): a widget that takes its own arrows (the
      // tree, a radio group, a menu) handles them first, and the registry leaves a handled key
      down: config('ArrowDown', 'Next notification', 1),
      up: config('ArrowUp', 'Previous notification', -1),
    };
  }, []);

  useRegisterHotkey(hotkeys.next);
  useRegisterHotkey(hotkeys.previous);
  useRegisterHotkey(hotkeys.down);
  useRegisterHotkey(hotkeys.up);

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Home and End only while the list has focus: elsewhere they scroll the page
    const deltas: Record<string, number> = {
      Home: -items.length,
      End: items.length,
    };
    const delta = deltas[event.key];

    if (delta === undefined || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    event.preventDefault();
    hotkeys.move(delta);
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

        const row = (event.target as Element).closest<HTMLElement>('[role="row"]');

        if (row?.id.startsWith(ROW_ID_PREFIX)) {
          useCursorStore.getState().setCursor(row.id.slice(ROW_ID_PREFIX.length));
        }
      }}
    >
      <VirtualList
        semantics="rows"
        data={items}
        getKey={getKey}
        cursorKey={cursor ?? undefined}
        className={styles.list}
        renderItem={renderItem}
      />
    </div>
  );
};
