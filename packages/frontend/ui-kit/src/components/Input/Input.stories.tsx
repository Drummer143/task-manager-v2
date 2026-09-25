import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentProps, CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from './Input';
import { FieldInput } from './FieldInput';
import { InlineInput, type InlineEditStart, type InlineSaveStatus } from './InlineInput';
import { Textarea } from './Textarea';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';
import { useRegisterHotkey } from '../../interaction/hotkeys';
import { detectPlatform } from '../../utils';

/* Demo scaffolding only. */
function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 320px)',
  gap: `${cssVar('sp-5')} ${cssVar('sp-6')}`,
  alignItems: 'start',
  padding: cssVar('sp-6'),
};

function Caption({ children }: { children: ReactNode }) {
  return (
    <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta'), paddingTop: cssVar('sp-3') }}>
      {children}
    </span>
  );
}

/** Controlled like a real owner would be — one state per field. */
function Field(props: Omit<ComponentProps<typeof FieldInput>, 'value' | 'onValueChange'> & { initial?: string }) {
  const { initial = '', ...rest } = props;
  const [value, setValue] = useState(initial);

  return <Input {...rest} value={value} onValueChange={setValue} />;
}

function FieldStates() {
  return (
    <>
      <Caption>default</Caption>
      <Field aria-label="Task title" initial="Task title" />
      <Caption>placeholder</Caption>
      <Field aria-label="Task title" placeholder="Task title" />
      <Caption>error</Caption>
      <Field aria-label="Task id" initial="TM-" error="No task with this ID" />
      <Caption>disabled · reason</Caption>
      <Field aria-label="Product" initial="Product" disabled disabledReason="Unavailable: the board is archived" />
      <Caption>icon · hotkey</Caption>
      <Field aria-label="Filter" placeholder="Filter" icon={<SearchIcon />} keys="/" />
      <Caption>textarea</Caption>
      <TextareaDemo />
    </>
  );
}

function TextareaDemo() {
  const [value, setValue] = useState('Grows line by line up to 12 lines, then scrolls.');

  return <Textarea aria-label="Description" value={value} onValueChange={setValue} />;
}

const meta: Meta<typeof Input> = {
  title: 'Primitives/Input',
  component: Input,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Input>;

/** Field: hover, focus (Tab or click), type. The error one shows its line at once. */
export const Fields: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <FieldStates />
    </div>
  ),
};

/**
 * The error waits for blur: type an id without "TM-" — nothing red while
 * typing; leave the field and the line appears. Fix it — it goes at once.
 */
export const ErrorOnBlur: Story = {
  render: () => {
    const [value, setValue] = useState('');
    const error = value && !value.startsWith('TM-') ? 'No task with this ID' : undefined;

    return (
      <div style={{ width: cssVar('panel-width') }}>
        <Input aria-label="Task id" placeholder="TM-248" value={value} onValueChange={setValue} error={error} />
      </div>
    );
  },
};

/** On a dark surface: 6% light base, light border, accent-400 focus, danger-300 errors. */
export const FieldsOnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <FieldStates />
    </Surface>
  ),
};

/** Height and side padding follow the density; the text size does not. */
export const FieldDensities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'contents' }}>
          <Caption>{density}</Caption>
          <Field aria-label="Filter" placeholder="Filter" icon={<SearchIcon />} keys="/" />
        </div>
      ))}
    </div>
  ),
};

/* ─── Inline ─── */

interface Row {
  id: string;
  title: string;
  status: InlineSaveStatus;
  unsaved?: string;
  remote?: { key: number; by?: ReactNode };
}

/* Demo only: the kit has no Avatar yet — initials in a circle stand in. */
function Initials({ children }: { children: string }) {
  return (
    <span
      aria-label={`Edited by ${children}`}
      role="img"
      style={{
        display: 'inline-grid',
        placeItems: 'center',
        width: cssVar('avatar-sm'),
        height: cssVar('avatar-sm'),
        borderRadius: cssVar('radius-full'),
        background: cssVar('bg-sunken'),
        color: cssVar('text-secondary'),
        fontSize: cssVar('type-meta'),
      }}
    >
      {children}
    </span>
  );
}

const ROWS: Row[] = [
  { id: 'TM-241', title: 'Hotkey registry', status: 'idle' },
  { id: 'TM-244', title: 'Move the token layer into a separate package and load it first', status: 'idle' },
  { id: 'TM-248', title: 'AppShell: shell hotkeys and resize', status: 'idle' },
];

const table: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `max-content minmax(0, ${cssVar('column-width')}) max-content`,
  width: 'max-content',
  borderTop: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  fontSize: cssVar('type-body'),
};

const cellFrame: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  borderBottom: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
};

const meta12: CSSProperties = {
  ...cellFrame,
  paddingInline: cssVar('cell-padding-x'),
  color: cssVar('text-muted'),
  fontSize: cssVar('type-meta'),
  fontVariantNumeric: cssVar('num-tabular'),
};

/**
 * A live table, the way it will own inline cells: it keeps the values, the
 * keyboard cursor and which cell is in the edit. Click a title to put the
 * cursor, Enter / double click / E / a letter to edit, Tab to the next row,
 * ⌘Enter (Ctrl+Enter) to open the task — an app hotkey the cell lets through.
 * "Fail the next save" makes the next save fail: Retry, or Enter on the cell.
 * "Someone edits TM-248" is a remote edit: a short tint and the author's
 * initials; while that cell is in your edit, your text is kept.
 */
function LiveTable() {
  const [rows, setRows] = useState(ROWS);
  const [cursor, setCursor] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [failNext, setFailNext] = useState(false);
  const [log, setLog] = useState('—');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // The app's hotkey, not the kit's: in a table Enter edits, ⌘Enter opens (spec 10).
  const openTask = useMemo(() => {
    const mac = detectPlatform() === 'mac';

    return {
      key: 'Enter',
      meta: mac,
      ctrl: !mac,
      description: 'Open task',
      callback: () => setLog(cursorRef.current ? `${cursorRef.current}: open task` : 'no cursor'),
    };
  }, []);
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  useRegisterHotkey(openTask);

  const patch = (id: string, change: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));

  const save = (row: Row, title: string) => {
    if (title === row.title && row.status !== 'error') {
      return;
    }

    // The value before this save — what comes back if it fails.
    const previous = row.title;
    const fail = failNext;
    setFailNext(false);

    // Optimistic: the new value is on screen at once, the dot says it is in flight.
    patch(row.id, { title, status: 'pending', unsaved: undefined });
    timers.current.push(
      setTimeout(() => {
        if (fail) {
          patch(row.id, { title: previous, status: 'error', unsaved: title });
          setLog(`${row.id}: not saved`);
        } else {
          patch(row.id, { status: 'idle' });
          setLog(`${row.id}: saved`);
        }
      }, 700),
    );
  };

  return (
    <div style={{ display: 'grid', gap: cssVar('sp-4') }}>
      <div style={table} role="table" aria-label="Tasks">
        {rows.map((row, index) => (
          <div key={row.id} role="row" style={{ display: 'contents' }}>
            <span style={meta12}>{row.id}</span>
            <div style={cellFrame} onClick={() => setCursor(row.id)} onFocus={() => setCursor(row.id)}>
              <InlineInput
                aria-label={`Title of ${row.id}`}
                value={row.title}
                cursor={cursor === row.id}
                editing={editing === row.id}
                status={row.status}
                unsavedValue={row.unsaved}
                maxLength={80}
                required
                onEditingChange={(next: boolean, how?: InlineEditStart) => {
                  setCursor(row.id);
                  setEditing(next ? row.id : null);
                  setLog(next ? `${row.id}: edit (${how ?? 'caret'})` : `${row.id}: done`);
                }}
                onCommit={(title, move) => {
                  save(row, title);

                  if (move) {
                    const next = rows[index + move];
                    setEditing(next ? next.id : null);
                    setCursor(next ? next.id : row.id);
                  }
                }}
                onCancel={() => setLog(`${row.id}: cancelled`)}
                onRetry={() => save(row, row.unsaved ?? row.title)}
                remoteEdit={row.remote}
              />
            </div>
            <span style={meta12}>{row.status === 'idle' ? '' : row.status}</span>
          </div>
        ))}
      </div>
      <button
        type="button"
        style={{ justifySelf: 'start' }}
        onClick={() => {
          const key = Date.now();
          const title = `AppShell: shell hotkeys and resize · v${(key % 90) + 10}`;

          // In a real app this comes from sync; the author's mark goes after a while.
          patch('TM-248', { title, remote: { key, by: <Initials>IP</Initials> } });
          timers.current.push(setTimeout(() => patch('TM-248', { remote: { key } }), 2000));
          setLog('TM-248: edited by someone else');
        }}
      >
        Someone edits TM-248
      </button>
      <label style={{ display: 'flex', gap: cssVar('sp-3'), fontSize: cssVar('type-meta'), color: cssVar('text-secondary') }}>
        <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />
        Fail the next save
      </label>
      <Caption>Last: {log}</Caption>
    </div>
  );
}

/** The main habitat: a table cell. */
export const InlineTable: Story = {
  render: () => <LiveTable />,
};

/** Every state at rest, side by side — the geometry is the same in each. */
function InlineStates() {
  const noop = () => undefined;
  const common = { onEditingChange: noop, onCommit: noop, editing: false, 'aria-label': 'Title' } as const;
  const states: Array<[string, ReactNode]> = [
    ['rest', <InlineInput {...common} value="Hotkey registry" />],
    ['cursor · keyboard', <InlineInput {...common} value="Hotkey registry" cursor />],
    ['empty', <InlineInput {...common} value="" placeholder="Untitled" />],
    ['saving', <InlineInput {...common} value="Hotkey registry" status="pending" />],
    ['save failed', <InlineInput {...common} value="Hotkey registry" status="error" unsavedValue="Hotkey registry v2" onRetry={noop} />],
    ['conflict', <InlineInput {...common} value="Hotkey registry" status="conflict" onResolveConflict={noop} />],
    ['read only · hover', <InlineInput {...common} value="Hotkey registry" readOnlyReason="Archived board" />],
    ['long · rest', <InlineInput {...common} value="Move the token layer into a separate package and load it first" />],
    ['editing', <InlineInput {...common} editing value="Hotkey registry" />],
    ['editing · too long', <InlineInput {...common} editing value="Move the token layer into a separ" maxLength={20} />],
  ];

  return (
    <>
      {states.map(([caption, node]) => (
        <div key={caption} style={{ display: 'contents' }}>
          <Caption>{caption}</Caption>
          <div style={cellFrame}>{node}</div>
        </div>
      ))}
    </>
  );
}

export const InlineStatesGallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <InlineStates />
    </div>
  ),
};

/** Inline on a dark surface: light frames, accent-400 in the edit, danger-300 for failures. */
export const InlineOnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <InlineStates />
    </Surface>
  ),
};

/** Two more sizes: the panel title (22 px, wraps) and a column name (label). */
export const TitleAndColumnName: Story = {
  render: () => {
    const [title, setTitle] = useState('AppShell: shell hotkeys and resize');
    const [name, setName] = useState('In progress');
    const [editing, setEditing] = useState<'title' | 'name' | null>(null);

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-6'), width: cssVar('panel-width') }}>
        <InlineInput
          aria-label="Task title"
          size="title"
          multiline
          required
          value={title}
          editing={editing === 'title'}
          onEditingChange={(next) => setEditing(next ? 'title' : null)}
          onCommit={setTitle}
        />
        <div style={{ width: cssVar('column-width') }}>
          <InlineInput
            aria-label="Status name"
            size="label"
            required
            value={name}
            editing={editing === 'name'}
            onEditingChange={(next) => setEditing(next ? 'name' : null)}
            onCommit={setName}
          />
        </div>
      </div>
    );
  },
};
