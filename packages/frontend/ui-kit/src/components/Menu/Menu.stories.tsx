import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useRef, useState } from 'react';
import { Menu } from './Menu';
import { ContextMenu } from './ContextMenu';
import type { MenuItem } from './types';
import { Button, IconButton } from '../Button';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

/* Demo scaffolding only: stand-in glyphs until the kit has its icon set. */
const glyph = (d: string) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  status: glyph('M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 2.5v11'),
  assignee: glyph('M8 8a2.5 2.5 0 1 0 0-5a2.5 2.5 0 0 0 0 5M3.5 13.5c.6-2.3 2.4-3.5 4.5-3.5s3.9 1.2 4.5 3.5'),
  due: glyph('M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3'),
  link: glyph('M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1'),
  move: glyph('M3 8h10M9.5 4.5 13 8l-3.5 3.5'),
  trash: glyph('M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.5 9h6l.5-9'),
  more: glyph('M4 8h.01M8 8h.01M12 8h.01'),
};

const statusDot = (color: string) => (
  <span style={{ width: cssVar('tag-dot'), height: cssVar('tag-dot'), borderRadius: cssVar('radius-full'), background: color }} />
);

const row: CSSProperties = { display: 'flex', gap: cssVar('sp-4'), alignItems: 'center' };

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

/** The live example of spec 09: actions, a submenu, a checkbox, radios, an async item, a disabled and a destructive one. */
function useTaskActions(log: (message: string) => void): MenuItem[] {
  const [watching, setWatching] = useState(true);
  const [sort, setSort] = useState('due');
  const [status, setStatus] = useState('progress');
  const attempts = useRef(0);

  return [
    { type: 'label', label: 'Task TM-248' },
    { type: 'action', id: 'status', label: 'Status', icon: ICONS.status, keys: 's', onSelect: () => log('Status') },
    { type: 'action', id: 'assignee', label: 'Assignee', icon: ICONS.assignee, keys: 'a', onSelect: () => log('Assignee') },
    {
      type: 'submenu',
      id: 'due',
      label: 'Due date',
      icon: ICONS.due,
      items: [
        { type: 'action', id: 'today', label: 'Today', onSelect: () => log('Due: today') },
        { type: 'action', id: 'tomorrow', label: 'Tomorrow', onSelect: () => log('Due: tomorrow') },
        { type: 'action', id: 'next-week', label: 'Next week', onSelect: () => log('Due: next week') },
      ],
    },
    {
      type: 'action',
      id: 'guest-link',
      label: 'Create guest link',
      icon: ICONS.link,
      // The first attempt fails, the retry passes — like a flaky network.
      onSelect: () =>
        new Promise<void>((resolve, reject) =>
          setTimeout(() => {
            attempts.current += 1;

            if (attempts.current % 2 === 1) {
              reject(new Error('Failed: offline'));
            } else {
              log('Guest link copied');
              resolve();
            }
          }, 900),
        ),
    },
    {
      type: 'action',
      id: 'move',
      label: 'Move to workspace',
      icon: ICONS.move,
      disabledReason: 'Unavailable: only the board owner can move tasks',
    },
    { type: 'checkbox', id: 'watch', label: 'Watch task', checked: watching, onCheckedChange: setWatching, keys: 'w' },
    { type: 'separator' },
    {
      type: 'radio-group',
      id: 'sort',
      label: 'Sort',
      value: sort,
      onValueChange: (value) => {
        setSort(value);
        log(`Sort: ${value}`);
      },
      options: [
        { value: 'due', label: 'By due date' },
        { value: 'priority', label: 'By priority' },
        { value: 'created', label: 'By creation date' },
      ],
    },
    { type: 'separator' },
    {
      type: 'radio-group',
      id: 'status-choice',
      label: 'Move to',
      value: status,
      onValueChange: (value) => {
        setStatus(value);
        log(`Status: ${value}`);
      },
      options: [
        { value: 'progress', label: 'In progress', icon: statusDot('#3b82f6') },
        { value: 'review', label: 'Review', icon: statusDot('#a855f7') },
        { value: 'done', label: 'Done', icon: statusDot('#22c55e') },
      ],
    },
    { type: 'separator' },
    { type: 'action', id: 'delete', label: 'Delete', icon: ICONS.trash, keys: 'mod+backspace', danger: true, onSelect: () => log('Deleted') },
  ];
}

const meta: Meta<typeof Menu> = {
  title: 'Primitives/Menu',
  component: Menu,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Menu>;

/**
 * ↓ / Enter / Space on the button — open, cursor on the first item (↑ — the
 * last). ↑↓ — the cursor, the unavailable one is skipped. A letter — jump to an
 * item; an item's hotkey (S, A, W, ⌘⌫) runs it directly. → / ← — the submenu.
 * Esc — close and return focus. "Watch" toggles without closing; "Sort" closes.
 * "Create guest link" waits in the open menu: the first try fails on the spot,
 * Enter retries.
 */
export const Live: Story = {
  render: () => {
    const [last, setLast] = useState('—');
    const items = useTaskActions(setLast);

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}>
        <div style={row}>
          <Menu items={items} trigger={<Button>Actions ▾</Button>} />
          <Menu items={items} aria-label="Task actions" trigger={<IconButton icon={ICONS.more} label="More actions" />} />
        </div>
        <Caption>Last action: {last}</Caption>
      </div>
    );
  },
};

/** Opened from a dark surface: only the trigger recolors; the menu is always light. */
export const FromInverseSurface: Story = {
  render: () => {
    const [last, setLast] = useState('—');
    const items = useTaskActions(setLast);

    return (
      <Surface tone="inverse" style={{ ...row, padding: cssVar('sp-5'), borderRadius: cssVar('radius-md') }}>
        <Menu items={items} trigger={<Button variant="ghost">Actions ▾</Button>} />
        <Caption>Last action: {last}</Caption>
      </Surface>
    );
  },
};

/** Without icons at all there is no slot: the texts start at the edge. */
export const PlainText: Story = {
  render: () => (
    <Menu
      trigger={<Button>Sort ▾</Button>}
      items={[
        { type: 'action', id: 'a', label: 'Rename…', keys: 'f2' },
        { type: 'action', id: 'b', label: 'Duplicate', description: 'Without comments and history' },
        { type: 'separator' },
        { type: 'action', id: 'c', label: 'Archive', disabledReason: 'Unavailable: the board is archived' },
      ]}
    />
  ),
};

const card: CSSProperties = {
  display: 'grid',
  gap: cssVar('sp-2'),
  width: cssVar('column-width'),
  padding: cssVar('card-padding'),
  border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  borderRadius: cssVar('radius-sm'),
  background: cssVar('bg-raised'),
};

/**
 * Right click on a card — the menu at the pointer. Tab to a card and press
 * Shift+F10 (or the menu key) — the menu at its bottom-left corner; Esc brings
 * focus back to the card. Each card is wrapped, yet there is no menu machine
 * until a card is asked for its menu.
 */
export const OnCards: Story = {
  render: () => {
    const [last, setLast] = useState('—');
    const items = useTaskActions(setLast);

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-3'), justifyItems: 'start' }}>
        {['TM-241 · Hotkey registry', 'TM-244 · Token layer', 'TM-248 · AppShell'].map((title) => (
          <ContextMenu key={title} items={items}>
            <div tabIndex={0} style={card}>
              {title}
              <Caption>Right click or Shift+F10</Caption>
            </div>
          </ContextMenu>
        ))}
        <Caption>Last action: {last}</Caption>
      </div>
    );
  },
};
