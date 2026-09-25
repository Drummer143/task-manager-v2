import { createRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, type CheckboxChecked } from './Checkbox';
import styles from './Checkbox.module.scss';

/** A controlled owner, as every kit control expects (spec 00). */
const Owned = ({ initial = false, onChange = vi.fn() }: { initial?: CheckboxChecked; onChange?: (v: boolean) => void }) => {
  const [checked, setChecked] = useState<CheckboxChecked>(initial);

  return (
    <Checkbox
      label="Done"
      checked={checked}
      onCheckedChange={(next) => {
        onChange(next);
        setChecked(next);
      }}
    />
  );
};

describe('Checkbox · semantics', () => {
  it('is a native checkbox named by its label — the whole row is its hit zone', () => {
    const { container } = render(<Owned />);
    const box = screen.getByRole('checkbox', { name: 'Done' });

    expect(box.tagName).toBe('INPUT');
    expect(container.firstElementChild?.tagName).toBe('LABEL');
  });

  it('reads as checked, unchecked and mixed', () => {
    const view = render(<Checkbox label="All" checked onCheckedChange={vi.fn()} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(true);

    view.rerender(<Checkbox label="All" checked={false} onCheckedChange={vi.fn()} />);
    expect(box.checked).toBe(false);
    expect(box.indeterminate).toBe(false);

    view.rerender(<Checkbox label="All" checked="mixed" onCheckedChange={vi.fn()} />);
    expect(box.indeterminate).toBe(true);
    expect(box.checked).toBe(false);
  });

  it('draws the mark in the first frame: check for on, dash for mixed, nothing for off', () => {
    const view = render(<Checkbox label="All" checked onCheckedChange={vi.fn()} />);
    const mark = () => view.container.querySelector(`.${styles.mark}`);
    const on = mark()?.innerHTML;

    expect(mark()?.querySelector('svg')).not.toBeNull();

    view.rerender(<Checkbox label="All" checked="mixed" onCheckedChange={vi.fn()} />);
    expect(mark()?.querySelector('svg')).not.toBeNull();
    expect(mark()?.innerHTML).not.toBe(on);

    view.rerender(<Checkbox label="All" checked={false} onCheckedChange={vi.fn()} />);
    expect(mark()?.childElementCount).toBe(0);
  });

  it('works without a label when named otherwise — a table row', () => {
    const { container } = render(<Checkbox aria-label="Select TM-248" checked={false} onCheckedChange={vi.fn()} />);

    screen.getByRole('checkbox', { name: 'Select TM-248' });
    expect(container.firstElementChild?.classList.contains(styles.bare)).toBe(true);
  });

  it('requires a label or an accessible name at the type level', () => {
    // @ts-expect-error — neither label nor aria-label / aria-labelledby
    const unnamed = <Checkbox checked={false} onCheckedChange={vi.fn()} />;

    expect(unnamed).toBeTruthy();
  });

  it('puts className on the row, the ref and other DOM props on the input', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Checkbox ref={ref} className="custom" name="done" label="Done" checked={false} onCheckedChange={vi.fn()} />,
    );

    expect(ref.current).toBe(screen.getByRole('checkbox'));
    expect(ref.current?.getAttribute('name')).toBe('done');
    expect(container.firstElementChild?.classList.contains('custom')).toBe(true);
  });
});

describe('Checkbox · change', () => {
  it('toggles through onCheckedChange — by click on the box or on the label', () => {
    const onChange = vi.fn();
    render(<Owned onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Done'));

    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('leaves mixed when the owner checks all', () => {
    render(<Owned initial="mixed" />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(box);

    expect(box.indeterminate).toBe(false);
    expect(box.checked).toBe(true);
  });

  it('checks all from mixed (spec 05)', () => {
    const onChange = vi.fn();
    render(<Owned initial="mixed" onChange={onChange} />);

    fireEvent.click(screen.getByRole('checkbox'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports shiftKey — the table selects a range with it', () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Select TM-248" checked={false} onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByRole('checkbox'), { shiftKey: true });
    fireEvent.click(screen.getByRole('checkbox'));

    expect(onCheckedChange.mock.calls).toEqual([
      [true, { shiftKey: true }],
      [true, { shiftKey: false }],
    ]);
  });

  it('stays as it is when controlled and the owner does not change it', () => {
    render(<Checkbox label="Done" checked={false} onCheckedChange={vi.fn()} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(box);

    expect(box.checked).toBe(false);
  });
});

describe('Checkbox · description and error', () => {
  it('describes the box by its description and error', () => {
    render(
      <Checkbox
        label="I understand this can’t be undone"
        description="Only when a task is assigned to you"
        error="Check this to continue"
        checked={false}
        onCheckedChange={vi.fn()}
      />,
    );
    const box = screen.getByRole('checkbox');

    expect(box.getAttribute('aria-invalid')).toBe('true');
    screen.getByRole('checkbox', { description: 'Only when a task is assigned to you Check this to continue' });
  });

  it('is not invalid without an error', () => {
    render(<Checkbox label="Done" checked={false} onCheckedChange={vi.fn()} />);

    expect(screen.getByRole('checkbox').hasAttribute('aria-invalid')).toBe(false);
    expect(screen.getByRole('checkbox').hasAttribute('aria-describedby')).toBe(false);
  });
});

describe('Checkbox · disabled', () => {
  it('keeps its value visible, stays focusable and does not change', () => {
    const onCheckedChange = vi.fn();
    const { container } = render(
      <Checkbox label="Unavailable · on" checked disabled disabledReason="Only the owner can change it" onCheckedChange={onCheckedChange} />,
    );
    const box = screen.getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(box);

    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(box.checked).toBe(true);
    expect(box.disabled).toBe(false);
    expect(box.getAttribute('aria-disabled')).toBe('true');
    expect(container.firstElementChild?.getAttribute('data-tooltip-reason')).toBe('Only the owner can change it');
  });

  it('stays mixed after a click — the browser clears indeterminate, the box puts it back', () => {
    render(<Checkbox label="3 of 7" checked="mixed" disabled onCheckedChange={vi.fn()} />);
    const box = screen.getByRole('checkbox') as HTMLInputElement;

    fireEvent.click(box);

    expect(box.indeterminate).toBe(true);
    expect(box.checked).toBe(false);
  });
});
