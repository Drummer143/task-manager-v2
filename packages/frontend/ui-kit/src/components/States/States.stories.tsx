import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect, useState, type ReactNode } from 'react';
import { cssVar } from '../../tokens';
import { Segmented } from '../Segmented';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Refetching } from './Refetching';
import { Skeleton } from './Skeleton';

/*
 * Demo only: a board region in every state. The board's own pieces (columns,
 * cards, its skeleton) are the app's — here they are drawn inline.
 */
const hairline = `${cssVar('border-width')} solid ${cssVar('border-hairline')}`;

type Mode = 'loading' | 'refetch' | 'data' | 'empty' | 'filtered' | 'error' | 'denied';

const MODES: { value: Mode; label: string }[] = [
  { value: 'loading', label: 'Loading' },
  { value: 'refetch', label: 'Refetching' },
  { value: 'data', label: 'Data' },
  { value: 'empty', label: 'Empty' },
  { value: 'filtered', label: 'Filtered' },
  { value: 'error', label: 'Error' },
  { value: 'denied', label: 'No access' },
];

const COLUMNS = [
  { title: 'Backlog', cards: ['Move tokens to a package', 'Hotkey registry'] },
  { title: 'In progress', cards: ['AppShell: shell hotkeys'] },
  { title: 'Review', cards: [] },
];

const Columns: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: cssVar('column-gap'), padding: cssVar('sp-4') }}>
    {children}
  </div>
);

const Column: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div
    style={{
      display: 'grid',
      alignContent: 'start',
      gap: cssVar('card-gap'),
      padding: cssVar('sp-3'),
      borderRadius: cssVar('radius-md'),
      background: cssVar('bg-sunken'),
    }}
  >
    {children}
  </div>
);

const Card: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div style={{ padding: cssVar('card-padding'), border: hairline, borderRadius: cssVar('radius-sm'), background: cssVar('bg-raised') }}>
    {children}
  </div>
);

/** What `Board.Skeleton` would be: the same columns and cards, in the same sizes. */
const BoardSkeleton: React.FC = () => (
  <Skeleton label="Loading board">
    <Columns>
      {[2, 1, 2].map((cards, column) => (
        <Column key={column}>
          <Skeleton.Line width="40%" sunken />
          {Array.from({ length: cards }, (_, card) => (
            <Skeleton.Block key={card} height={64}>
              <Skeleton.Line index={column + card} />
              <span style={{ display: 'flex', gap: cssVar('sp-2') }}>
                <Skeleton.Line width={36} />
                <Skeleton.Circle size={cssVar('avatar-sm')} style={{ marginLeft: 'auto' }} />
              </span>
            </Skeleton.Block>
          ))}
        </Column>
      ))}
    </Columns>
  </Skeleton>
);

const BoardData: React.FC<{ onCreate(): void }> = ({ onCreate }) => (
  <Columns>
    {COLUMNS.map((column) => (
      <Column key={column.title}>
        <div style={{ fontWeight: cssVar('weight-strong') }}>
          {column.title} <span style={{ color: cssVar('text-muted') }}>{column.cards.length}</span>
        </div>
        {column.cards.map((card) => (
          <Card key={card}>{card}</Card>
        ))}
        {column.cards.length === 0 && <EmptyState scale="row" title="No tasks" action={{ label: 'Create', keys: 'c', onAction: onCreate }} />}
      </Column>
    ))}
  </Columns>
);

const Board: React.FC = () => {
  const [mode, setMode] = useState<Mode>('data');
  const noop = () => undefined;

  // Retry: loads again, then the data is back.
  useEffect(() => {
    if (mode !== 'loading') {
      return;
    }

    const timer = setTimeout(() => setMode('data'), 1400);

    return () => clearTimeout(timer);
  }, [mode]);

  const filtered = mode === 'filtered';

  return (
    <div style={{ display: 'grid', gap: cssVar('sp-4') }}>
      <Segmented<Mode> aria-label="State" size="sm" value={mode} options={MODES} onValueChange={setMode} />
      <div style={{ border: hairline, borderRadius: cssVar('radius-sm'), background: cssVar('bg-raised'), overflow: 'hidden' }}>
        <div
          style={{
            height: cssVar('canvas-header-height'),
            display: 'flex',
            alignItems: 'center',
            gap: cssVar('sp-3'),
            padding: `0 ${cssVar('sp-4')}`,
            borderBottom: hairline,
            fontWeight: cssVar('weight-strong'),
          }}
        >
          Q3 board
          <span style={{ fontWeight: 'normal', fontSize: cssVar('type-meta'), color: filtered ? cssVar('text-accent') : cssVar('text-muted') }}>
            {filtered ? 'Assignee: me · Overdue' : 'Filter'}
          </span>
        </div>
        <div style={{ minHeight: 280, display: 'grid' }}>
          {mode === 'loading' && <BoardSkeleton />}
          {(mode === 'data' || mode === 'refetch') && (
            <Refetching active={mode === 'refetch'}>
              <BoardData onCreate={noop} />
            </Refetching>
          )}
          {mode === 'empty' && (
            <EmptyState
              title="This board has no tasks yet"
              description="Tasks you create here show up in Backlog."
              action={{ label: 'Create task', keys: 'c', onAction: noop }}
            />
          )}
          {filtered && (
            <EmptyState
              title="No tasks match “Assignee: me · Overdue”"
              description="3 tasks on this board are hidden by the filter."
              action={{ label: 'Reset filter', onAction: () => setMode('data') }}
            />
          )}
          {mode === 'error' && (
            <ErrorState
              title="Couldn’t load this board"
              reason="The server didn’t respond."
              dataSafe="safe"
              onRetry={() => setMode('loading')}
              details="E504 · request 7f3a"
            />
          )}
          {/* No access is the app's: an empty state with who to ask. */}
          {mode === 'denied' && (
            <EmptyState
              title="You don’t have access to “Q3 board”"
              description="It belongs to the Product workspace. Its owner can add you."
              action={{ label: 'Request access', onAction: noop }}
              secondary={{ label: 'Go to your boards', onAction: noop }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

const Scales: React.FC = () => {
  const noop = () => undefined;
  const caption = { fontSize: cssVar('type-meta'), color: cssVar('text-muted') };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: cssVar('sp-5'), alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: cssVar('sp-2') }}>
        <span style={caption}>Area · a board did not load</span>
        <div style={{ border: hairline, borderRadius: cssVar('radius-sm'), overflow: 'hidden' }}>
          <ErrorState title="Couldn’t load this board" reason="The server didn’t respond." dataSafe="safe" onRetry={noop} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: cssVar('sp-2') }}>
        <span style={caption}>Block · a panel section</span>
        <ErrorState scale="block" title="Couldn’t load activity" onRetry={noop} />
        <EmptyState scale="block" title="No comments yet" action={{ label: 'Write one', keys: 'm', onAction: noop }} />
      </div>
      <div style={{ display: 'grid', gap: cssVar('sp-2') }}>
        <span style={caption}>Row · an attachment, a column</span>
        <ErrorState scale="row" title="Upload failed" onRetry={noop} secondary={{ label: 'Remove', onAction: noop }} />
        <EmptyState scale="row" title="No tasks" action={{ label: 'Create', keys: 'c', onAction: noop }} />
        <EmptyState scale="row" title="No subtasks" />
      </div>
    </div>
  );
};

const meta: Meta = {
  title: 'Patterns/States',
};

export default meta;

/** One board, every answer. Retry loads again: the skeleton appears after 200 ms and pulses once. */
export const BoardStates: StoryObj = { render: () => <Board /> };

/** Never wider than what broke: area, block, row. */
export const ScaleSet: StoryObj = { name: 'Scales', render: () => <Scales /> };

/** “Inbox zero” — the one empty that is good news: no action. */
export const Done: StoryObj = {
  render: () => (
    <div style={{ height: 280, display: 'grid', border: hairline, borderRadius: cssVar('radius-sm') }}>
      <EmptyState title="Inbox zero" description="You’re all caught up." />
    </div>
  ),
};

/** Shapes on a raised and on a sunken surface. */
export const Shapes: StoryObj = {
  render: () => (
    <Skeleton immediate label="Loading">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: cssVar('sp-5'), maxWidth: 560 }}>
        <Skeleton.Block height={96}>
          <Skeleton.Line index={0} />
          <Skeleton.Line index={1} />
          <span style={{ display: 'flex', gap: cssVar('sp-2') }}>
            <Skeleton.Line width={36} />
            <Skeleton.Circle size={cssVar('avatar-sm')} style={{ marginLeft: 'auto' }} />
          </span>
        </Skeleton.Block>
        <div style={{ display: 'grid', gap: cssVar('sp-4'), padding: cssVar('sp-3'), background: cssVar('bg-sunken'), borderRadius: cssVar('radius-sm') }}>
          {[0, 1, 2, 3].map((index) => (
            <Skeleton.Line key={index} index={index + 3} sunken style={{ marginLeft: index % 3 ? cssVar('sp-5') : 0 }} />
          ))}
        </div>
      </div>
    </Skeleton>
  ),
};
