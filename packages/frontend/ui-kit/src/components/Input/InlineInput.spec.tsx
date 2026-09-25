import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InlineInput, type InlineInputProps } from './InlineInput';
import { KitRoot } from '../KitRoot';
import styles from './InlineInput.module.scss';
import { getHotkeyCombinationString, useHotkeysStore } from '../../interaction/hotkeys';

type HarnessProps = Partial<InlineInputProps> & {
  onCommitSpy?: (value: string, move?: 1 | -1) => void;
  onEditingSpy?: (editing: boolean) => void;
};

/**
 * The owner as a table would be: it keeps the saved value and decides whether
 * the cell is in the edit. KitRoot drives the Esc ladder.
 */
const Harness = ({ onCommitSpy, onEditingSpy, value: initial = 'Hotkey registry', ...props }: HarnessProps) => {
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);

  return (
    <KitRoot>
      <InlineInput
        aria-label="Title"
        value={value}
        editing={editing}
        onEditingChange={(next) => {
          onEditingSpy?.(next);
          setEditing(next);
        }}
        onCommit={(next, move) => {
          onCommitSpy?.(next, move);
          setValue(next);

          if (move) {
            setEditing(false); // a table would open the neighbour here
          }
        }}
        {...props}
      />
      <button type="button">Elsewhere</button>
    </KitRoot>
  );
};

const cell = () => screen.getByRole('button', { name: /Hotkey registry|Untitled/ });
const editor = () => screen.getByRole('textbox') as HTMLInputElement;
const pressOnCell = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(cell(), { key, ...init });
const escape = () =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

afterEach(() => {
  useHotkeysStore.setState({ hotkeys: {} });
});

describe('InlineInput · at rest', () => {
  it('is the text of its context — a focusable cell, no text field', () => {
    render(<Harness />);

    expect(cell().textContent).toBe('Hotkey registry');
    expect(cell().tabIndex).toBe(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('shows the placeholder while empty', () => {
    render(<Harness value="" placeholder="Untitled" />);

    expect(cell().textContent).toBe('Untitled');
  });

  it('marks the keyboard cursor, but not on a read-only cell', () => {
    const view = render(<Harness cursor />);
    expect(view.container.querySelector('[data-cursor]')).not.toBeNull();

    view.rerender(<Harness cursor readOnlyReason="Archived" />);
    expect(view.container.querySelector('[data-cursor]')).toBeNull();
  });

  it('gives a long value its full text in a tooltip — only when it is cut', () => {
    render(<Harness />);

    expect(cell().hasAttribute('data-tooltip-overflow')).toBe(true);
  });
});

describe('InlineInput · accessible name', () => {
  it('names the cell by its field and value', () => {
    render(<Harness />);

    screen.getByRole('button', { name: 'Title: Hotkey registry' });
  });

  it.each([
    ['pending', 'saving'],
    ['error', 'not saved'],
    ['conflict', 'conflict'],
  ] as const)('adds the %s state after the value', (status, spoken) => {
    render(<Harness status={status} onRetry={vi.fn()} onResolveConflict={vi.fn()} />);

    screen.getByRole('button', { name: `Title: Hotkey registry, ${spoken}` });
  });

  it('takes its strings from KitRoot messages, English by default', () => {
    render(
      <KitRoot messages={{ retry: 'Повторить', cellNotSaved: 'не сохранено' }}>
        <InlineInput aria-label="Название" value="Задача" editing={false} status="error" onRetry={vi.fn()} onEditingChange={vi.fn()} onCommit={vi.fn()} />
      </KitRoot>,
    );

    screen.getByRole('button', { name: 'Название: Задача, не сохранено' });
    screen.getByRole('button', { name: 'Повторить' });
  });
});

describe('InlineInput · entering the edit', () => {
  it.each([['Enter'], ['F2']])('%s puts the caret at the end', (key) => {
    render(<Harness />);

    pressOnCell(key);

    expect(editor().value).toBe('Hotkey registry');
    expect(document.activeElement).toBe(editor());
    expect(editor().selectionStart).toBe('Hotkey registry'.length);
  });

  it('double click puts the caret at the end', () => {
    render(<Harness />);

    fireEvent.doubleClick(cell());

    expect(editor().selectionStart).toBe('Hotkey registry'.length);
  });

  it('E selects the whole value', () => {
    render(<Harness />);

    pressOnCell('e');

    expect([editor().selectionStart, editor().selectionEnd]).toEqual([0, 'Hotkey registry'.length]);
  });

  it('a typed character replaces the value, as in spreadsheets', () => {
    const onEditingChange = vi.fn();
    render(<Harness onEditingSpy={onEditingChange} />);

    pressOnCell('x');

    expect(editor().value).toBe('x');
  });

  it("does not start on the app's hotkey letters or on the first step of a sequence", () => {
    const store = useHotkeysStore.getState();
    const down = { key: 'j', callback: vi.fn(), description: 'Cursor down' };
    const board = { key: 'b', chord: { key: 'g' }, callback: vi.fn(), description: 'Go to board' };
    store.registerHotkey(getHotkeyCombinationString(down), down);
    store.registerHotkey(getHotkeyCombinationString(board), board);
    render(<Harness />);

    pressOnCell('j');
    pressOnCell('g');
    pressOnCell('Control', { ctrlKey: true });

    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('InlineInput · ⌘Enter', () => {
  it.each([
    ['⌘Enter', { metaKey: true }],
    ['Ctrl+Enter', { ctrlKey: true }],
  ])('%s is not for the cell — it reaches the app, which opens the task', (_, init) => {
    const openTask = vi.fn();
    const meta = 'metaKey' in init;
    const registered = { key: 'Enter', meta, ctrl: !meta, callback: openTask, description: 'Open task' };
    useHotkeysStore.getState().registerHotkey(getHotkeyCombinationString(registered), registered);
    render(<Harness />);

    act(() => {
      cell().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, ...init }));
    });

    expect(openTask).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('InlineInput · leaving the edit', () => {
  it('Enter saves, leaves the edit and brings focus back to the cell', () => {
    const onCommit = vi.fn();
    render(<Harness onCommitSpy={onCommit} />);

    pressOnCell('Enter');
    fireEvent.change(editor(), { target: { value: 'Hotkey registry v2' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Hotkey registry v2', undefined);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Title: Hotkey registry v2' }));
  });

  it.each([
    ['Tab', false, 1],
    ['Shift+Tab', true, -1],
  ] as const)('%s saves and hands the move to the parent — the cell does not ask to leave', (_, shiftKey, move) => {
    const onCommit = vi.fn();
    const onEditing = vi.fn();
    render(<Harness onCommitSpy={onCommit} onEditingSpy={onEditing} />);

    pressOnCell('Enter');
    onEditing.mockClear();
    fireEvent.keyDown(editor(), { key: 'Tab', shiftKey });

    expect(onCommit).toHaveBeenCalledWith('Hotkey registry', move);
    expect(onEditing).not.toHaveBeenCalled();
  });

  it('Esc cancels through the Esc ladder: nothing is saved', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onCommitSpy={onCommit} onCancel={onCancel} />);

    pressOnCell('Enter');
    fireEvent.change(editor(), { target: { value: 'Typo' } });
    escape();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(cell().textContent).toBe('Hotkey registry');
  });

  it('leaving the cell saves', () => {
    const onCommit = vi.fn();
    render(<Harness onCommitSpy={onCommit} />);

    pressOnCell('Enter');
    fireEvent.change(editor(), { target: { value: 'Moved on' } });
    act(() => screen.getByRole('button', { name: 'Elsewhere' }).focus());

    expect(onCommit).toHaveBeenCalledWith('Moved on', undefined);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }));
  });

  it('saves only once — Enter, then a blur while the parent still holds the edit', () => {
    const onCommit = vi.fn();
    render(<InlineInput aria-label="Title" value="Draft" editing onEditingChange={vi.fn()} onCommit={onCommit} />);

    fireEvent.keyDown(editor(), { key: 'Enter' });
    fireEvent.blur(editor());

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not save an empty required value — the previous one comes back', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(<Harness onCommitSpy={onCommit} onCancel={onCancel} required />);

    pressOnCell('Enter');
    fireEvent.change(editor(), { target: { value: '   ' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });

    expect(onCommit).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(cell().textContent).toBe('Hotkey registry');
  });

  it('keeps what is typed when the saved value changes during the edit', () => {
    const Owner = ({ value }: { value: string }) => (
      <InlineInput value={value} editing onEditingChange={vi.fn()} onCommit={vi.fn()} aria-label="Title" />
    );
    const view = render(<Owner value="Mine" />);

    fireEvent.change(editor(), { target: { value: 'Mine, edited' } });
    view.rerender(<Owner value="Theirs" />);

    expect(editor().value).toBe('Mine, edited');
  });
});

describe('InlineInput · validation', () => {
  it('lets a too long value be typed but not saved — a counter shows it', () => {
    const onCommit = vi.fn();
    const { container } = render(<Harness onCommitSpy={onCommit} maxLength={5} />);

    pressOnCell('e');
    fireEvent.change(editor(), { target: { value: 'Too long' } });
    fireEvent.keyDown(editor(), { key: 'Enter' });
    fireEvent.keyDown(editor(), { key: 'Tab' });
    fireEvent.blur(editor());

    expect(onCommit).not.toHaveBeenCalled();
    expect(editor().getAttribute('aria-invalid')).toBe('true');
    screen.getByRole('textbox', { description: '8 / 5' });
    expect(container.querySelector('[data-invalid]')).not.toBeNull();
  });

  it('shows the validate message and blocks saving; Esc still cancels', () => {
    const onCommit = vi.fn();
    render(<Harness onCommitSpy={onCommit} validate={(v) => (v.startsWith('TM-') ? null : 'Must start with TM-')} />);

    pressOnCell('x');
    fireEvent.keyDown(editor(), { key: 'Enter' });
    screen.getByRole('textbox', { description: 'Must start with TM-' });

    escape();

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('InlineInput · save status', () => {
  it('shows a pending save as a quiet dot', () => {
    const { container } = render(<Harness status="pending" />);

    expect(container.querySelector('[data-status="pending"] span[aria-hidden="true"]')).not.toBeNull();
  });

  it('a failed save: Retry, the unsaved value in the tooltip, Enter retries', () => {
    const onRetry = vi.fn();
    render(<Harness status="error" unsavedValue="Hotkey registry v2" onRetry={onRetry} />);

    expect(cell().getAttribute('data-tooltip')).toBe('Hotkey registry v2');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    pressOnCell('Enter');

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('an edit over a failed save starts from what did not save', () => {
    render(<Harness status="error" unsavedValue="Hotkey registry v2" onRetry={vi.fn()} />);

    fireEvent.doubleClick(cell());

    expect(editor().value).toBe('Hotkey registry v2');
  });

  it('a conflict offers to resolve it — by click or Enter', () => {
    const onResolveConflict = vi.fn();
    render(<Harness status="conflict" onResolveConflict={onResolveConflict} />);

    fireEvent.click(screen.getByRole('button', { name: 'Conflict · resolve' }));
    pressOnCell('Enter');

    expect(onResolveConflict).toHaveBeenCalledTimes(2);
  });
});

describe('InlineInput · remote edit', () => {
  const Remote = ({ edit, editing = false }: { edit?: InlineInputProps['remoteEdit']; editing?: boolean }) => (
    <InlineInput aria-label="Title" value="Hotkey registry" editing={editing} onEditingChange={vi.fn()} onCommit={vi.fn()} remoteEdit={edit} />
  );
  const flash = (container: HTMLElement) => container.querySelector(`.${styles.remoteFlash}`);

  it('does not light up for the key the cell was born with', () => {
    const { container } = render(<Remote edit={{ key: 1 }} />);

    expect(flash(container)).toBeNull();
  });

  it('lights up on every new key, restarting the fade', () => {
    const view = render(<Remote edit={{ key: 1 }} />);

    view.rerender(<Remote edit={{ key: 2 }} />);
    const first = flash(view.container);
    expect(first).not.toBeNull();
    expect(first?.getAttribute('aria-hidden')).toBe('true');

    view.rerender(<Remote edit={{ key: 3 }} />);
    expect(flash(view.container)).not.toBe(first); // a new element — the animation starts over
  });

  it('works when the first remote edit comes to a cell that had none', () => {
    const view = render(<Remote />);

    view.rerender(<Remote edit={{ key: 'a' }} />);

    expect(flash(view.container)).not.toBeNull();
  });

  it('is not tinted during an edit', () => {
    const view = render(<Remote edit={{ key: 1 }} editing />);

    view.rerender(<Remote edit={{ key: 2 }} editing />);

    expect(flash(view.container)).toBeNull();
  });

  it("shows the author the app draws, for as long as the app passes it", () => {
    const view = render(<Remote edit={{ key: 1, by: <img alt="Edited by ‹author›" /> }} />);
    screen.getByRole('img', { name: 'Edited by ‹author›' });

    view.rerender(<Remote edit={{ key: 1 }} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('InlineInput · read-only and multiline', () => {
  it('does not enter the edit and gives its reason in a tooltip', () => {
    render(<Harness readOnlyReason="Archived board" />);

    fireEvent.doubleClick(cell());
    pressOnCell('Enter');
    pressOnCell('x');

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(cell().getAttribute('aria-disabled')).toBe('true');
    expect(cell().getAttribute('data-tooltip-reason')).toBe('Archived board');
  });

  it('edits a multiline title in a textarea where Enter saves instead of breaking the line', () => {
    const onCommit = vi.fn();
    render(<Harness onCommitSpy={onCommit} multiline size="title" />);

    pressOnCell('Enter');

    expect(editor().tagName).toBe('TEXTAREA');

    fireEvent.keyDown(editor(), { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith('Hotkey registry', undefined);
  });
});
