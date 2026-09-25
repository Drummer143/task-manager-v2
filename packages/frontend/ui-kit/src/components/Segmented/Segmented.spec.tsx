import { createRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Segmented, type SegmentedOption } from './Segmented';
import styles from './Segmented.module.scss';

type View = 'board' | 'table' | 'calendar';

const OPTIONS: SegmentedOption<View>[] = [
  { value: 'board', label: 'Board', keys: 'g b' },
  { value: 'table', label: 'Table', keys: 'g t' },
  { value: 'calendar', label: 'Calendar', disabledReason: 'Needs due dates on the board' },
];

const Owned = ({
  initial = 'board',
  options = OPTIONS,
  onChange = vi.fn(),
}: {
  initial?: View;
  options?: SegmentedOption<View>[];
  onChange?: (v: View) => void;
}) => {
  const [value, setValue] = useState<View>(initial);

  return (
    <Segmented
      aria-label="View"
      value={value}
      options={options}
      onValueChange={(next) => {
        onChange(next);
        setValue(next);
      }}
    />
  );
};

const radio = (name: string | RegExp) => screen.getByRole('radio', { name });
const press = (key: string) => fireEvent.keyDown(document.activeElement as Element, { key });

describe('Segmented · semantics', () => {
  it('is a named radio group of segments; the chosen one is checked', () => {
    render(<Owned />);

    screen.getByRole('radiogroup', { name: 'View' });
    expect(radio(/Board/).getAttribute('aria-checked')).toBe('true');
    expect(radio(/Table/).getAttribute('aria-checked')).toBe('false');
  });

  it('is one Tab stop — the chosen segment', () => {
    render(<Owned initial="table" />);

    expect(screen.getAllByRole('radio').map((segment) => segment.tabIndex)).toEqual([-1, 0, -1]);
  });

  it('moves the Tab stop to the first available one when the chosen one is not', () => {
    render(<Owned initial="calendar" />);

    expect(radio(/Board/).tabIndex).toBe(0);
    expect(radio(/Calendar/).tabIndex).toBe(-1);
  });

  it('requires aria-label at the type level', () => {
    // @ts-expect-error — the group has no visible caption: aria-label is required
    const unnamed = <Segmented value="board" options={OPTIONS} onValueChange={vi.fn()} />;

    expect(unnamed).toBeTruthy();
  });

  it('forwards className, ref and DOM props to the group', () => {
    const ref = createRef<HTMLDivElement>();
    render(<Segmented ref={ref} className="custom" id="views" aria-label="View" value="board" options={OPTIONS} onValueChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup');

    expect(ref.current).toBe(group);
    expect(group.id).toBe('views');
    expect(group.classList.contains('custom')).toBe(true);
    expect(group.classList.contains(styles.md)).toBe(true);
  });
});

describe('Segmented · choosing', () => {
  it('applies a click at once', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);

    fireEvent.click(radio(/Table/));

    expect(onChange).toHaveBeenCalledWith('table');
    expect(radio(/Table/).getAttribute('aria-checked')).toBe('true');
  });

  it('does not report the value already chosen', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);

    fireEvent.click(radio(/Board/));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('chooses with the arrows, round the group, skipping the unavailable one', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);

    act(() => radio(/Board/).focus());
    press('ArrowRight'); // → Table
    press('ArrowRight'); // Calendar is skipped → round to Board
    press('ArrowLeft'); // → Table

    expect(onChange.mock.calls).toEqual([['table'], ['board'], ['table']]);
    expect(document.activeElement).toBe(radio(/Table/));
  });

  it('jumps with Home and End', () => {
    const onChange = vi.fn();
    render(<Owned initial="table" onChange={onChange} />);

    act(() => radio(/Table/).focus());
    press('Home');
    press('End');

    expect(onChange.mock.calls).toEqual([['board'], ['table']]);
  });
});

describe('Segmented · content', () => {
  it('shows the hotkey hint inline next to the label', () => {
    render(<Owned />);

    expect(radio(/Board/).querySelector('kbd')?.getAttribute('data-variant')).toBe('inline');
  });

  it('names an icon-only segment by its label and gives it a tooltip with the hotkey', () => {
    render(
      <Segmented
        aria-label="View"
        value="board"
        onValueChange={vi.fn()}
        options={[
          { value: 'board', label: 'Board', icon: <svg data-testid="icon" />, iconOnly: true, keys: 'g b' },
          { value: 'table', label: 'Table', icon: <svg />, iconOnly: true },
        ]}
      />,
    );
    const board = screen.getByRole('radio', { name: 'Board' });

    expect(board.textContent).toBe('');
    expect(board.getAttribute('data-tooltip')).toBe('Board');
    expect(board.getAttribute('data-tooltip-keys')).toBe('g b');
    expect(board.classList.contains(styles.iconOnly)).toBe(true);
    expect(screen.getByTestId('icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Segmented · unavailable', () => {
  it('explains an unavailable segment and ignores clicks on it', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);
    const calendar = radio(/Calendar/);

    fireEvent.click(calendar);

    expect(onChange).not.toHaveBeenCalled();
    expect(calendar.getAttribute('aria-disabled')).toBe('true');
    expect(calendar.getAttribute('data-tooltip-reason')).toBe('Needs due dates on the board');
  });

  it('disables the whole group with one reason — readable from the keyboard', () => {
    const onValueChange = vi.fn();
    render(
      <Segmented
        aria-label="View"
        value="board"
        options={OPTIONS}
        onValueChange={onValueChange}
        disabled
        disabledReason="Views are locked on this board"
      />,
    );
    const group = screen.getByRole('radiogroup');

    act(() => radio(/Board/).focus());
    press('ArrowRight');
    fireEvent.click(radio(/Table/));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(group.getAttribute('aria-disabled')).toBe('true');
    expect(group.getAttribute('data-tooltip-reason')).toBe('Views are locked on this board');
    expect(radio(/Board/).tabIndex).toBe(0);
    // One reason for the group — the segments do not each carry their own.
    expect(radio(/Calendar/).hasAttribute('data-tooltip-reason')).toBe(false);
  });
});
