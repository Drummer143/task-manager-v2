import { createRef, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Input } from './Input';
import { Textarea } from './Textarea';
import styles from './Input.module.scss';
import inlineStyles from './InlineInput.module.scss';

/** A controlled owner, as a form would be. */
const Owned = ({ initial = '', onCommit = vi.fn(), error }: { initial?: string; onCommit?: (v: string) => void; error?: string }) => {
  const [value, setValue] = useState(initial);

  return <Input aria-label="Task title" value={value} onValueChange={setValue} onCommit={onCommit} error={error} />;
};

describe('Input · field', () => {
  it('is a native text field, controlled: changes go out through onValueChange', () => {
    const onValueChange = vi.fn();
    render(<Input aria-label="Task title" value="AppShell" onValueChange={onValueChange} />);
    const input = screen.getByRole('textbox', { name: 'Task title' }) as HTMLInputElement;

    expect(input.value).toBe('AppShell');

    fireEvent.change(input, { target: { value: 'AppShell v2' } });

    expect(onValueChange).toHaveBeenCalledWith('AppShell v2');
  });

  it('commits on Enter and on blur', () => {
    const onCommit = vi.fn();
    render(<Owned initial="Draft" onCommit={onCommit} />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenLastCalledWith('Draft');

    fireEvent.change(input, { target: { value: 'Final' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith('Final');
  });

  it('does not commit on an Enter that picks an IME candidate', () => {
    const onCommit = vi.fn();
    render(<Owned onCommit={onCommit} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', isComposing: true });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it('puts the icon in a decorative slot and the hotkey hint at the right edge', () => {
    const { container } = render(
      <Input aria-label="Filter" value="" onValueChange={vi.fn()} icon={<svg data-testid="icon" />} keys="/" />,
    );
    const frame = container.querySelector(`.${styles.field}`) as HTMLElement;

    expect(frame.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    expect(frame.firstElementChild?.firstElementChild).toBe(screen.getByTestId('icon'));
    expect(frame.lastElementChild?.tagName).toBe('KBD');
    expect(frame.lastElementChild?.getAttribute('data-variant')).toBe('inline');
  });

  it('puts className on the frame, the ref and other DOM props on the input', () => {
    const ref = createRef<HTMLInputElement>();
    const { container } = render(
      <Input ref={ref} className="custom" name="title" placeholder="Task title" value="" onValueChange={vi.fn()} />,
    );
    const input = screen.getByPlaceholderText('Task title');

    expect(ref.current).toBe(input);
    expect(input.getAttribute('name')).toBe('title');
    expect((container.firstElementChild as HTMLElement).classList.contains('custom')).toBe(true);
  });

  it('selects the whole value on focus when asked', () => {
    render(<Input aria-label="Id" value="TM-248" onValueChange={vi.fn()} selectOnFocus />);
    const input = screen.getByRole('textbox') as HTMLInputElement;

    act(() => input.focus());

    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6]);
  });
});

describe('Input · field error', () => {
  it('shows an error that arrives while not focused at once — linked to the input', () => {
    render(<Owned error="No task with this ID" />);
    const input = screen.getByRole('textbox');

    expect(input.getAttribute('aria-invalid')).toBe('true');
    screen.getByRole('textbox', { description: 'No task with this ID' });
  });

  it('holds an error that arrives mid-typing until blur', () => {
    const view = render(<Owned />);
    const input = screen.getByRole('textbox');

    act(() => input.focus());
    view.rerender(<Owned error="No task with this ID" />);
    expect(screen.queryByText('No task with this ID')).toBeNull();

    act(() => input.blur());
    screen.getByText('No task with this ID');
  });

  it('removes a cleared error at once, even while focused', () => {
    const view = render(<Owned error="No task with this ID" />);

    act(() => screen.getByRole('textbox').focus());
    view.rerender(<Owned />);

    expect(screen.queryByText('No task with this ID')).toBeNull();
    expect(screen.getByRole('textbox').hasAttribute('aria-invalid')).toBe(false);
  });
});

describe('Input · field disabled', () => {
  it('is aria-disabled and read-only — focusable for its reason, not editable', () => {
    const onValueChange = vi.fn();
    const onCommit = vi.fn();
    const { container } = render(
      <Input
        aria-label="Product"
        value="Product"
        onValueChange={onValueChange}
        onCommit={onCommit}
        disabled
        disabledReason="Unavailable: archived board"
      />,
    );
    const input = screen.getByRole('textbox') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'x' } });
    act(() => input.focus());
    act(() => input.blur());

    expect(input.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(container.querySelector('[data-tooltip-reason]')?.getAttribute('data-tooltip-reason')).toBe(
      'Unavailable: archived board',
    );
  });
});

describe('Input · modes', () => {
  it('renders the inline mode with mode="inline"', () => {
    const { container } = render(
      <Input mode="inline" value="Hotkey registry" editing={false} onEditingChange={vi.fn()} onCommit={vi.fn()} />,
    );

    expect(container.querySelector(`.${inlineStyles.root}`)).not.toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('Textarea', () => {
  it('commits on ⌘/Ctrl+Enter and on blur; a plain Enter is a new line', () => {
    const onCommit = vi.fn();
    render(<Textarea aria-label="Description" value="Line" onValueChange={vi.fn()} onCommit={onCommit} />);
    const textarea = screen.getByRole('textbox');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.blur(textarea);
    expect(onCommit).toHaveBeenCalledTimes(3);
  });

  it('grows with its text up to --textarea-max-rows, then scrolls', () => {
    const scrollHeight = vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    render(
      <Textarea
        aria-label="Description"
        value={'line\n'.repeat(60)}
        onValueChange={vi.fn()}
        // jsdom has no stylesheet: give the numbers autoGrow reads.
        style={{ lineHeight: '20px', padding: '0px', border: '0px' }}
      />,
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    expect(textarea.style.height).toBe('240px'); // 12 rows × 20 px
    expect(textarea.style.overflowY).toBe('auto');

    scrollHeight.mockRestore();
  });

  it('does not grow when autoGrow is off', () => {
    render(<Textarea aria-label="Description" value="text" onValueChange={vi.fn()} autoGrow={false} />);

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('');
  });

  it('follows the field error rules', () => {
    render(<Textarea aria-label="Description" value="" onValueChange={vi.fn()} error="Too long" />);

    screen.getByRole('textbox', { description: 'Too long' });
  });
});
