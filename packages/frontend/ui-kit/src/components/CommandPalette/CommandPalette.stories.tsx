import type { Meta, StoryObj } from '@storybook/react-vite';
import { ReactNode, useState } from 'react';
import { palette, usePaletteCreate, usePaletteSource } from './hooks';
import { filterByLabel } from './matchLabel';
import type { PaletteItem, PaletteSource } from './types';
import { Button } from '../Button';
import { Checkbox } from '../Checkbox';
import { Avatar } from '../Avatar';
import { Kbd } from '../Kbd';
import { cssVar } from '../../tokens';

/* Demo data only — what a product would pass. */
const COMMANDS: PaletteItem[] = [
  { id: 'create', label: 'Create task', keys: 'c' },
  { id: 'move-done', label: 'Move task to Done', keys: 'mod+right' },
  { id: 'assign-me', label: 'Assign to me', keys: 'a' },
  { id: 'go-board', label: 'Go to board', keys: 'g b' },
  { id: 'go-table', label: 'Go to table', keys: 'g t' },
  { id: 'density', label: 'Toggle compact density' },
  { id: 'sidebar', label: 'Collapse sidebar', keys: '[' },
  { id: 'copy', label: 'Copy link to current view', keys: 'mod+shift+c' },
  {
    id: 'delete-board',
    label: 'Delete board…',
    danger: true,
    confirm: { title: 'Delete “Q3 board”?', body: '42 tasks will be removed. This can’t be undone.', label: 'Delete board' },
  },
];

const PAGES: PaletteItem[] = [
  { id: 'p-q3', label: 'Q3 board', path: 'Product / Web' },
  { id: 'p-req', label: 'Requirements', path: 'Product / Web' },
  { id: 'p-retro', label: 'Q3 retro', path: 'Product / Web' },
  { id: 'p-infra', label: 'Infrastructure', path: 'Product' },
];

const TASKS: PaletteItem[] = [
  { id: 't-248', meta: 'TM-248', label: 'AppShell: shell hotkeys and resize', path: 'Q3 board' },
  { id: 't-251', meta: 'TM-251', label: 'Hotkey registry and cheat sheet', path: 'Q3 board' },
  { id: 't-260', meta: 'TM-260', label: 'Mutation queue with idempotency keys', path: 'Q3 board' },
];

const PEOPLE = [
  { id: 'u-anna', name: 'Anna Kim' },
  { id: 'u-ivan', name: 'Ivan Petrov' },
  { id: 'u-maria', name: 'Maria Sokolova' },
];

const STATUSES: PaletteSource = {
  id: 'move-to',
  title: 'Move to',
  search: (query) =>
    filterByLabel(
      ['Backlog', 'In progress', 'Review', 'Done'].map((label) => ({ id: label, label })),
      query,
    ),
};

/** The screen registers its sources — the palette itself lives in KitRoot's layer. */
function Screen({ log, selected }: { log: (message: string) => void; selected: boolean }) {
  const withLog = (items: PaletteItem[], verb: string) =>
    items.map((item) => ({ ...item, onSelect: () => log(`${verb}: ${item.meta ? `${item.meta} · ` : ''}${item.label}`) }));

  usePaletteSource({
    id: 'context',
    title: '2 selected tasks',
    search: (query) =>
      selected
        ? filterByLabel(
            [
              { id: 'x-move', label: 'Move 2 tasks to…', keys: 'mod+right', next: { ...STATUSES, search: (q, c) => withLog(STATUSES.search(q, c) as PaletteItem[], 'Moved to') } },
              { id: 'x-assign', label: 'Assign 2 tasks', keys: 'a' },
            ],
            query,
          )
        : [],
  });
  usePaletteSource({
    id: 'recent',
    title: 'Recent',
    search: (query) => (query ? [] : withLog([PAGES[0], TASKS[0], PAGES[1]], 'Opened')),
  });
  usePaletteSource({
    id: 'commands',
    title: 'Commands',
    prefix: '>',
    search: (query, { scoped }) =>
      withLog(query || scoped ? filterByLabel(COMMANDS, query) : COMMANDS.slice(0, 4), 'Ran'),
  });
  usePaletteSource({
    id: 'pages',
    title: 'Pages',
    search: (query) => (query ? withLog(filterByLabel(PAGES, query), 'Opened') : []),
  });
  usePaletteSource({
    id: 'tasks',
    title: 'Tasks',
    prefix: '#',
    search: (query, { scoped }) =>
      query || scoped
        ? withLog(
            TASKS.filter((task) => task.meta?.toLowerCase().includes(query.toLowerCase()) || filterByLabel([task], query).length),
            'Opened',
          )
        : [],
  });
  // People come from the server: rows arrive a moment later and are added to their group.
  usePaletteSource({
    id: 'people',
    title: 'People',
    prefix: '@',
    search: (query, { scoped, signal }) =>
      query || scoped
        ? new Promise<PaletteItem[]>((resolve) => {
            const timer = setTimeout(
              () =>
                resolve(
                  withLog(
                    filterByLabel(
                      PEOPLE.map((person) => ({
                        id: person.id,
                        label: person.name,
                        icon: <Avatar size="xs" name={person.name} id={person.id} />,
                      })),
                      query,
                    ),
                    'Tasks of',
                  ),
                ),
              300,
            );
            signal.addEventListener('abort', () => clearTimeout(timer));
          })
        : [],
  });
  usePaletteCreate((query) => [
    { id: 'n-task', label: `Create task “${query}”`, onSelect: () => log(`Created task “${query}”`) },
    { id: 'n-page', label: `Create page “${query}”`, onSelect: () => log(`Created page “${query}”`) },
  ]);

  return null;
}

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

const meta: Meta = {
  title: 'Patterns/CommandPalette',
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj;

/**
 * ⌘K / Ctrl+K anywhere — also from a text field; again — close. Empty: recent
 * and frequent. "mov" — commands; ">" only commands, "#" tasks, "@" people
 * (people arrive a moment later); "q3" — a page with its path; "zzz" — create
 * a task with that name; "delete board" — a confirmation inside the palette.
 * With the selection on, its actions come first; "Move 2 tasks to…" asks for
 * the status as a second step (Backspace in the empty field goes back).
 */
export const Live: Story = {
  render: () => {
    const [last, setLast] = useState('—');
    const [selected, setSelected] = useState(false);

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}>
        <Screen log={setLast} selected={selected} />
        <div style={{ display: 'flex', gap: cssVar('sp-5'), alignItems: 'center' }}>
          <Button keys="mod+k" onClick={palette.open}>
            Open palette
          </Button>
          <Checkbox label="2 tasks selected on the board" checked={selected} onCheckedChange={setSelected} />
        </div>
        <input placeholder="⌘K works from here too" aria-label="Any field" />
        <Caption>
          Last: {last} · <Kbd keys="mod+k" variant="inline" /> to open
        </Caption>
      </div>
    );
  },
};
