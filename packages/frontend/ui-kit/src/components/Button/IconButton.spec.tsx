import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';
import styles from './Button.module.scss';
import { raw } from '../../tokens';

const Icon = () => <svg data-testid="icon" aria-hidden="true" />;

describe('IconButton', () => {
  it('is named by its label — the icon carries no name', () => {
    render(<IconButton icon={<Icon />} label="Add task" />);

    screen.getByRole('button', { name: 'Add task' });
  });

  it('requires a label at the type level', () => {
    // @ts-expect-error — label is required (spec)
    const unnamed = <IconButton icon={<Icon />} />;
    // @ts-expect-error — no visible text: children are not accepted
    const withText = <IconButton icon={<Icon />} label="Add task">Add</IconButton>;

    expect(unnamed).toBeTruthy();
    expect(withText).toBeTruthy();
  });

  it('shows the icon only', () => {
    render(<IconButton icon={<Icon />} label="Add task" />);
    const button = screen.getByRole('button');

    expect(button.children).toHaveLength(1);
    expect(button.firstElementChild?.firstElementChild).toBe(screen.getByTestId('icon'));
  });

  it('is square and ghost by default', () => {
    render(<IconButton icon={<Icon />} label="Add task" />);
    const button = screen.getByRole('button');

    expect(button.classList.contains(styles.iconOnly)).toBe(true);
    expect(button.classList.contains(styles.ghost)).toBe(true);
    expect(button.classList.contains(styles.md)).toBe(true);
  });

  it('takes any Button variant and size', () => {
    render(<IconButton icon={<Icon />} label="Delete" variant="danger" size="sm" />);
    const button = screen.getByRole('button');

    expect(button.classList.contains(styles.danger)).toBe(true);
    expect(button.classList.contains(styles.sm)).toBe(true);
  });

  it('puts the label and the hotkey into its tooltip, not on the button', () => {
    const { container } = render(<IconButton icon={<Icon />} label="Add task" keys="c" tooltipPlacement="right" />);
    const button = screen.getByRole('button');

    expect(button.getAttribute('data-tooltip')).toBe('Add task');
    expect(button.getAttribute('data-tooltip-keys')).toBe('c');
    expect(button.getAttribute('data-tooltip-placement')).toBe('right');
    expect(container.querySelector('kbd')).toBeNull();
  });

  it('carries the disabled reason on the button itself — one trigger, the reason wins in the host', () => {
    const { container } = render(
      <IconButton icon={<Icon />} label="Archive" disabled disabledReason="Unavailable: no access" />,
    );
    const button = screen.getByRole('button', { name: 'Archive' });

    expect(container.firstElementChild).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(button.getAttribute('data-tooltip-reason')).toBe('Unavailable: no access');
  });

  it('puts an icon-sized spinner in place of the icon while busy', () => {
    vi.useFakeTimers();
    const { container } = render(<IconButton icon={<Icon />} label="Copy link" loading />);

    act(() => {
      vi.advanceTimersByTime(raw['spinner-delay']);
    });
    vi.useRealTimers();

    expect(container.querySelector('[role="status"] svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${raw['spinner-size-sm']} ${raw['spinner-size-sm']}`,
    );
  });

  it('keeps the label tooltip when disabled without a reason', () => {
    render(<IconButton icon={<Icon />} label="Archive" disabled />);

    expect(screen.getByRole('button').getAttribute('data-tooltip')).toBe('Archive');
  });

  it('works as a link', () => {
    render(<IconButton icon={<Icon />} label="Open task" href="/task/42" />);

    expect(screen.getByRole('link', { name: 'Open task' }).getAttribute('href')).toBe('/task/42');
  });

  it('calls onClick and forwards ref and className', () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement & HTMLAnchorElement>();
    render(<IconButton icon={<Icon />} label="Add task" onClick={onClick} ref={ref} className="custom" />);
    const button = screen.getByRole('button');

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(button);
    expect(button.classList.contains('custom')).toBe(true);
    expect(button.classList.contains(styles.iconOnly)).toBe(true);
  });
});
