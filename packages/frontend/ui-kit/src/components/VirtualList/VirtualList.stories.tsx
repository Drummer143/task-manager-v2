import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect, useState } from 'react';
import { VirtualList } from './VirtualList';
import { cssVar } from '../../tokens';

const meta: Meta<typeof VirtualList> = {
  title: 'Lists/VirtualList',
  component: VirtualList,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ height: '100vh' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof VirtualList>;

export const Default: Story = {
  render: () => {
    return (
      <VirtualList
        data={Array.from({ length: 5000 }, (_, i) => i)}
        renderItem={(item) => <div>{item}</div>}
      />
    );
  },
};

const ROW = 32;

const KeyboardCursorDemo: React.FC = () => {
  const [ids, setIds] = useState(() =>
    Array.from({ length: 5000 }, (_, i) => `row-${i}`),
  );
  const [cursor, setCursor] = useState('row-0');
  const [added, setAdded] = useState(0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step =
        event.key === 'j' || event.key === 'ArrowDown'
          ? 1
          : event.key === 'k' || event.key === 'ArrowUp'
            ? -1
            : 0;

      if (step === 0) return;

      event.preventDefault();
      setCursor((key) => {
        const index = ids.indexOf(key);

        return ids[Math.min(Math.max(index + step, 0), ids.length - 1)];
      });
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [ids]);

  const prepend = () => {
    setAdded((n) => n + 1);
    setIds((current) => [`new-${added + 1}`, ...current]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: cssVar('sp-3'),
          padding: cssVar('sp-3'),
          alignItems: 'center',
        }}
      >
        <span>
          J / K or ↓ / ↑ move the cursor: <b>{cursor}</b>
        </span>
        <button type="button" onClick={() => setCursor('row-3000')}>
          Jump to row-3000
        </button>
        <button type="button" onClick={prepend}>
          Prepend a row
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <VirtualList
          data={ids}
          getKey={(id) => id}
          cursorKey={cursor}
          fixedHeight={ROW}
          renderItem={(id) => (
            <div
              data-cursor={id === cursor || undefined}
              style={{
                height: ROW,
                paddingInline: cssVar('sp-3'),
                display: 'flex',
                alignItems: 'center',
                background: id === cursor ? cssVar('bg-hover') : undefined,
                boxShadow:
                  id === cursor
                    ? `inset 2px 0 0 ${cssVar('border-accent')}`
                    : undefined,
              }}
            >
              {id}
            </div>
          )}
        />
      </div>
    </div>
  );
};

/**
 * The cursor (spec Inbox 08): J/K moves it, the list follows by the least shift; scroll the
 * wheel away and its row stays mounted; a row prepended above moves neither the cursor nor the
 * view.
 */
export const KeyboardCursor: Story = {
  render: () => <KeyboardCursorDemo />,
};

/*
 * The Inbox shape: day headers (32 px) between notifications (56 px), two known heights given
 * to `estimateSize`, so the list never jumps when rows come in.
 */
const HEADER = 32;
const NOTIFICATION = 56;
const DAYS = ['Today', 'Yesterday', 'This week', 'Earlier'];

type InboxRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'row'; id: string; label: string };

const inboxRows: InboxRow[] = DAYS.flatMap((day, d) => [
  { kind: 'header' as const, id: `h-${d}`, label: day },
  ...Array.from({ length: 150 }, (_, i) => ({
    kind: 'row' as const,
    id: `n-${d}-${i}`,
    label: `Notification ${d}.${i}`,
  })),
]);

/** Group headers and notifications: two fixed heights in one list. */
export const Groups: Story = {
  render: () => (
    <VirtualList<InboxRow>
      data={inboxRows}
      getKey={(row) => row.id}
      estimateSize={(index) =>
        inboxRows[index].kind === 'header' ? HEADER : NOTIFICATION
      }
      renderItem={(row) =>
        row.kind === 'header' ? (
          <div
            style={{
              height: HEADER,
              display: 'flex',
              alignItems: 'center',
              paddingInlineStart: cssVar('sp-6'),
              color: cssVar('text-muted'),
              fontSize: cssVar('type-meta'),
            }}
          >
            {row.label}
          </div>
        ) : (
          <div
            style={{
              height: NOTIFICATION,
              display: 'flex',
              alignItems: 'center',
              paddingInline: cssVar('sp-6'),
              borderBottom: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
            }}
          >
            {row.label}
          </div>
        )
      }
    />
  ),
};

const PAGE = 50;
const PAGES = 5;
const CANVAS_HEADER = 96;

const InCanvasDemo: React.FC = () => {
  const [canvas, setCanvas] = useState<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState(PAGE);
  const [loading, setLoading] = useState(false);

  // A page "arrives" 600 ms later; the timer goes with the story
  useEffect(() => {
    if (!loading) return;

    const timer = setTimeout(() => {
      setLoaded((count) => count + PAGE);
      setLoading(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [loading]);

  const data = Array.from({ length: loaded }, (_, i) => `notification-${i}`);
  const hasMore = loaded < PAGE * PAGES;

  return (
    // The canvas is the one scroll area of the shell; the list is part of it
    <div
      ref={setCanvas}
      style={{
        height: '100%',
        overflow: 'auto',
        background: cssVar('bg-canvas'),
      }}
    >
      <div
        style={{
          height: CANVAS_HEADER,
          display: 'flex',
          alignItems: 'center',
          paddingInline: cssVar('sp-6'),
          borderBottom: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
        }}
      >
        Canvas header · {loaded} loaded{hasMore ? '' : ' · that is all'}
      </div>
      {canvas && (
        <VirtualList
          data={data}
          getKey={(id) => id}
          fixedHeight={NOTIFICATION}
          scrollMargin={CANVAS_HEADER}
          getScrollElement={() => canvas}
          endThreshold={10}
          onEndReached={() => {
            if (hasMore) setLoading(true);
          }}
          renderItem={(id) => (
            <div
              style={{
                height: NOTIFICATION,
                display: 'flex',
                alignItems: 'center',
                paddingInline: cssVar('sp-6'),
                borderBottom: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
              }}
            >
              {id}
            </div>
          )}
          footer={
            loading && (
              <div
                style={{ padding: cssVar('sp-6'), color: cssVar('text-muted') }}
              >
                Loading…
              </div>
            )
          }
        />
      )}
    </div>
  );
};

/**
 * Inside the shell's canvas, total unknown (cursor pagination, the Inbox): the canvas scrolls,
 * the header above counts (`scrollMargin`), the next page of 50 is asked for 10 rows before the
 * end, and `footer` shows it loading. The end of the list is not marked.
 */
export const InCanvas: Story = {
  render: () => <InCanvasDemo />,
};

const TOTAL = 10_000;
const OFFSET_PAGE = 100;

const KnownTotalDemo: React.FC = () => {
  // Pages by offset, loaded in any order: page n holds rows n * 100 … n * 100 + 99
  const [pages, setPages] = useState<Map<number, string[]>>(() => new Map());
  const [requested] = useState(() => new Set<number>());
  const timers = React.useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;

    return () => pending.forEach(clearTimeout);
  }, []);

  const load = ({
    startIndex,
    endIndex,
  }: {
    startIndex: number;
    endIndex: number;
  }) => {
    for (
      let page = Math.floor(startIndex / OFFSET_PAGE);
      page <= Math.floor(endIndex / OFFSET_PAGE);
      page++
    ) {
      if (requested.has(page)) continue;

      requested.add(page);
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setPages((current) =>
          new Map(current).set(
            page,
            Array.from(
              { length: OFFSET_PAGE },
              (_, i) => `Task ${page * OFFSET_PAGE + i + 1}`,
            ),
          ),
        );
      }, 500);
      timers.current.add(timer);
    }
  };

  // Sparse: each page lands at its own offset, whatever arrived before it
  const data: (string | undefined)[] = [];
  for (const [page, rows] of pages) {
    rows.forEach((task, i) => (data[page * OFFSET_PAGE + i] = task));
  }

  return (
    <VirtualList
      data={data}
      count={TOTAL}
      fixedHeight={ROW}
      onRangeChange={load}
      renderItem={(task) => (
        <div
          style={{
            height: ROW,
            display: 'flex',
            alignItems: 'center',
            paddingInline: cssVar('sp-3'),
          }}
        >
          {task}
        </div>
      )}
      renderPlaceholder={() => (
        <div
          style={{
            height: ROW,
            display: 'flex',
            alignItems: 'center',
            paddingInline: cssVar('sp-3'),
            color: cssVar('text-muted'),
          }}
        >
          Loading…
        </div>
      )}
    />
  );
};

/**
 * A known total (offset pagination, e.g. a table): all 10 000 rows take their place at once,
 * those not loaded show a placeholder, and the pages in view are loaded — drag the scrollbar
 * to the middle and the middle loads, not page 2.
 */
export const KnownTotal: Story = {
  render: () => <KnownTotalDemo />,
};
