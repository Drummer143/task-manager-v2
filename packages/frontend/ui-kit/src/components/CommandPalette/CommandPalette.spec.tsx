import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KitRoot } from '../KitRoot';
import { palette, usePaletteCreate, usePaletteSource } from './hooks';
import { filterByLabel } from './matchLabel';
import type { PaletteItem, PaletteSource } from './types';
import { useLayerStore } from '../../interaction/layers';
import { useEscapeStore } from '../../interaction/escape';

const COMMANDS: PaletteItem[] = [
  { id: 'create', label: 'Create task', keys: 'c' },
  { id: 'move-done', label: 'Move task to Done' },
  { id: 'go-board', label: 'Go to board' },
];

interface Setup {
  selected?: boolean;
  onRun?: (id: string) => void;
  people?: PaletteSource['search'];
  extra?: PaletteItem[];
  withCreate?: boolean;
}

const Screen = ({ selected = false, onRun = vi.fn(), people, extra = [], withCreate = true }: Setup) => {
  const run = (items: PaletteItem[]) => items.map((item) => ({ ...item, onSelect: () => onRun(item.id) }));

  usePaletteSource({
    id: 'context',
    title: 'Selection',
    search: () => (selected ? run([{ id: 'x-assign', label: 'Assign 2 tasks' }]) : []),
  });
  usePaletteSource({
    id: 'commands',
    title: 'Commands',
    prefix: '>',
    search: (query) => run(filterByLabel([...COMMANDS, ...extra], query)),
  });
  usePaletteSource({
    id: 'people',
    title: 'People',
    prefix: '@',
    search: people ?? (() => []),
  });

  usePaletteCreate((query) => (withCreate ? run([{ id: `new:${query}`, label: `Create task “${query}”` }]) : []));

  return (
    <button type="button" data-testid="opener">
      Somewhere
    </button>
  );
};

const renderPalette = (setup: Setup = {}) =>
  render(
    <KitRoot>
      <Screen {...setup} />
    </KitRoot>,
  );

const pressCmdK = (target: EventTarget = window) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, metaKey: false, bubbles: true, cancelable: true }));
  });

const dialog = () => screen.queryByRole('dialog', { name: 'Command palette' });
const field = () => screen.getByRole('combobox');
const type = (value: string) => fireEvent.change(field(), { target: { value } });
const key = (k: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(field(), { key: k, ...init });
const groups = () =>
  within(screen.getByRole('listbox')).queryAllByRole('group').map((group) => ({
    title: group.querySelector('[role="presentation"]')?.textContent,
    options: within(group).getAllByRole('option').map((option) => option.textContent),
  }));
const current = () => screen.getByRole('listbox').querySelector('[aria-selected="true"]')?.textContent;

beforeEach(() => {
  useLayerStore.setState({ layer: null, openedBy: null });
  useEscapeStore.setState({ stack: [] });
});

afterEach(() => {
  act(() => palette.close());
});

describe('CommandPalette · opening', () => {
  it('opens with ⌘K / Ctrl+K on any screen — also from a text field — and closes on a second press', () => {
    render(
      <KitRoot>
        <Screen />
        <input aria-label="Title" />
      </KitRoot>,
    );
    const input = screen.getByRole('textbox', { name: 'Title' });

    act(() => input.focus());
    pressCmdK(input);
    expect(dialog()).not.toBeNull();

    pressCmdK();
    expect(dialog()).toBeNull();
  });

  it('opens even from an element that stops its keys from bubbling', () => {
    render(
      <KitRoot>
        <Screen />
        <input aria-label="Greedy" onKeyDown={(event) => event.stopPropagation()} />
      </KitRoot>,
    );
    const greedy = screen.getByRole('textbox', { name: 'Greedy' });

    act(() => greedy.focus());
    fireEvent.keyDown(greedy, { key: 'k', ctrlKey: true });

    expect(dialog()).not.toBeNull();
  });

  it('focuses the field in the first frame', () => {
    renderPalette();

    act(() => palette.open());

    expect(document.activeElement).toBe(field());
  });

  it('is the app layer: a light scrim, the window, a modal dialog', () => {
    renderPalette();

    act(() => palette.open());

    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(dialog()?.closest('[data-layer]')).not.toBeNull();
  });
});

describe('CommandPalette · search', () => {
  it('shows the groups in the order the screens registered them; empty groups are hidden', () => {
    renderPalette({ selected: true });

    act(() => palette.open());

    expect(groups().map((group) => group.title)).toEqual(['Selection', 'Commands']);
  });

  it('narrows to a source by its prefix — a scope chip — and Backspace in the empty field removes it', () => {
    renderPalette({ selected: true });
    act(() => palette.open());

    type('>');

    expect(screen.getByRole('dialog').textContent).toContain('Commands');
    expect(field().getAttribute('placeholder')).toBe('Search commands…');
    expect(groups().map((group) => group.title)).toEqual(['Commands']);

    key('Backspace');

    expect(groups().map((group) => group.title)).toEqual(['Selection', 'Commands']);
  });

  it('marks what matched in bold', () => {
    renderPalette();
    act(() => palette.open());

    type('board');

    expect(screen.getByRole('option', { name: /Go to board/ }).querySelector('b')?.textContent).toBe('board');
  });

  it('shows at most five rows per group in a mixed search, up to fifty when narrowed', () => {
    const extra = Array.from({ length: 10 }, (_, index) => ({ id: `task-${index}`, label: `Task command ${index}` }));
    renderPalette({ extra, withCreate: false });
    act(() => palette.open());

    type('task');
    expect(groups()[0].options).toHaveLength(5);

    type('');
    type('>task');
    expect(groups()[0].options.length).toBeGreaterThan(5);
  });

  it('adds rows that arrive later, for the current query only', async () => {
    let resolve: ((items: PaletteItem[]) => void) | undefined;
    const signals: AbortSignal[] = [];
    renderPalette({
      withCreate: false,
      people: (_query, { signal }) => {
        signals.push(signal);

        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    act(() => palette.open());

    type('an');
    type('ann');
    expect(signals[0].aborted).toBe(true);

    await act(async () => resolve?.([{ id: 'anna', label: 'Anna Kim' }]));

    expect(groups().find((group) => group.title === 'People')?.options).toEqual(['Anna Kim']);
  });

  it('drops a late answer to a query that is no longer there', async () => {
    const answers = new Map<string, (items: PaletteItem[]) => void>();
    renderPalette({
      withCreate: false,
      people: (query) =>
        new Promise((done) => {
          answers.set(query, done);
        }),
    });
    act(() => palette.open());

    type('iv');
    type('an');
    await act(async () => answers.get('an')?.([{ id: 'anna', label: 'Anna Kim' }]));
    // The old query answers last: it neither shows nor wipes the current answer.
    await act(async () => answers.get('iv')?.([{ id: 'ivan', label: 'Ivan Petrov' }]));

    expect(groups().find((group) => group.title === 'People')?.options).toEqual(['Anna Kim']);
  });

  it('offers to create from the query — nothing found is not a dead end', () => {
    renderPalette();
    act(() => palette.open());

    type('zzz');

    expect(groups()).toEqual([{ title: 'Create', options: ['Create task “zzz”'] }]);
  });

  it('says so when there is nothing at all', () => {
    renderPalette({ withCreate: false });
    act(() => palette.open());

    type('zzz');

    expect(screen.getByRole('listbox').textContent).toBe('Nothing found');
  });
});

describe('CommandPalette · running', () => {
  it('moves the cursor round the rows, across groups', () => {
    renderPalette({ selected: true, withCreate: false });
    act(() => palette.open());

    expect(current()).toBe('Assign 2 tasks');
    key('ArrowDown');
    expect(current()).toContain('Create task');
    key('ArrowUp');
    key('ArrowUp');
    expect(current()).toBe('Go to board');
    key('Home');
    expect(current()).toBe('Assign 2 tasks');
  });

  it('runs the row on Enter after closing — focus is back where the palette was opened', () => {
    const onRun = vi.fn();
    renderPalette({ onRun });
    const opener = screen.getByTestId('opener');

    act(() => opener.focus());
    act(() => palette.open());
    type('move');
    key('Enter');

    expect(onRun).toHaveBeenCalledWith('move-done');
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps focus in the field on Tab — it is a layer', () => {
    renderPalette();
    act(() => palette.open());

    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    field().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('asks for an irreversible command inside the palette — the cursor starts on Cancel', () => {
    const onRun = vi.fn();
    renderPalette({
      onRun,
      extra: [{ id: 'delete', label: 'Delete board…', danger: true, confirm: { title: 'Delete “Q3 board”?', label: 'Delete board' } }],
    });
    act(() => palette.open());

    type('delete');
    key('Enter');

    expect(screen.getByRole('dialog').textContent).toContain('Delete “Q3 board”?');
    expect(current()).toContain('Cancel');

    key('Enter');
    expect(onRun).not.toHaveBeenCalled();
    expect(groups().length).toBeGreaterThan(0);

    key('Enter');
    key('ArrowDown');
    key('Enter');
    expect(onRun).toHaveBeenCalledWith('delete');
  });

  it('takes a second step: the variants replace the list; Backspace in the empty field goes back', () => {
    const moved = vi.fn();
    renderPalette({
      withCreate: false,
      extra: [
        {
          id: 'move-to',
          label: 'Move 2 tasks to…',
          next: {
            id: 'statuses',
            title: 'Move to',
            search: (query) => filterByLabel([{ id: 'done', label: 'Done', onSelect: moved }], query),
          },
        },
      ],
    });
    act(() => palette.open());

    type('move 2');
    key('Enter');

    expect(screen.getByRole('dialog').textContent).toContain('Move to');
    expect(groups()).toEqual([{ title: 'Move to', options: ['Done'] }]);

    key('Backspace');
    expect(groups().map((group) => group.title)).toContain('Commands');

    type('move 2');
    key('Enter');
    key('Enter');
    expect(moved).toHaveBeenCalledTimes(1);
  });
});

describe('CommandPalette · Esc steps back', () => {
  it('confirmation → list → clear the field → close', () => {
    renderPalette({
      extra: [{ id: 'delete', label: 'Delete board…', confirm: { title: 'Delete?', label: 'Delete board' } }],
    });
    act(() => palette.open());
    type('delete');
    key('Enter');

    const escape = () =>
      act(() => {
        field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });

    escape();
    expect(groups().length).toBeGreaterThan(0);
    expect(field()).toHaveProperty('value', 'delete');

    escape();
    expect(field()).toHaveProperty('value', '');
    expect(dialog()).not.toBeNull();

    escape();
    expect(dialog()).toBeNull();
  });

  it('closes on a click on the dimmed page, not inside the window', () => {
    renderPalette();
    act(() => palette.open());

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(dialog()).not.toBeNull();

    fireEvent.mouseDown(screen.getByRole('dialog').parentElement as HTMLElement);
    expect(dialog()).toBeNull();
  });
});

describe('usePaletteSource · order', () => {
  it('keeps a group in its place when its screen re-renders', () => {
    const First = () => {
      const [, setTick] = useState(0);

      usePaletteSource({ id: 'first', title: 'First', search: () => [{ id: 'f', label: 'One' }] });

      return (
        <button type="button" onClick={() => setTick((tick) => tick + 1)}>
          Re-render
        </button>
      );
    };
    const Second = () => {
      usePaletteSource({ id: 'second', title: 'Second', search: () => [{ id: 's', label: 'Two' }] });

      return null;
    };
    render(
      <KitRoot>
        <First />
        <Second />
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Re-render' }));
    act(() => palette.open());

    expect(groups().map((group) => group.title)).toEqual(['First', 'Second']);
  });
});

describe('usePaletteSource', () => {
  it('uses the latest source without re-registering — the group order does not change', () => {
    const Owner = () => {
      const [label, setLabel] = useState('First');

      usePaletteSource({ id: 'a', title: 'A', search: () => [{ id: 'x', label }] });
      usePaletteSource({ id: 'b', title: 'B', search: () => [{ id: 'y', label: 'Second' }] });

      return (
        <button type="button" onClick={() => setLabel('Renamed')}>
          Rename
        </button>
      );
    };
    render(
      <KitRoot>
        <Owner />
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    act(() => palette.open());

    expect(groups()).toEqual([
      { title: 'A', options: ['Renamed'] },
      { title: 'B', options: ['Second'] },
    ]);
  });
});
