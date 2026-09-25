import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raw } from '../../tokens';
import { Button } from './Button';
import styles from './Button.module.scss';

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('Button · semantics', () => {
  it('is a native button of type "button" — never an accidental form submit', () => {
    render(<Button>Create task</Button>);
    const button = screen.getByRole('button', { name: 'Create task' });

    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.hasAttribute('role')).toBe(false);
  });

  it('keeps an explicit type', () => {
    render(<Button type="submit">Save</Button>);

    expect(screen.getByRole('button').getAttribute('type')).toBe('submit');
  });

  it('renders a link that stays a link when given href', () => {
    render(<Button href="/w/acme/p/board">Open board</Button>);
    const link = screen.getByRole('link', { name: 'Open board' });

    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/w/acme/p/board');
    expect(link.hasAttribute('role')).toBe(false);
    expect(link.hasAttribute('type')).toBe(false);
  });

  it('passes target, rel and download to the link', () => {
    render(
      <Button
        href="/export.csv"
        target="_blank"
        rel="noopener"
        download="export.csv"
      >
        Export
      </Button>,
    );
    const link = screen.getByRole('link');

    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener');
    expect(link.getAttribute('download')).toBe('export.csv');
  });

  it('forwards className, ref and other DOM props to the element', () => {
    const ref = createRef<HTMLButtonElement & HTMLAnchorElement>();
    render(
      <Button ref={ref} className="custom" id="create" data-testid="create">
        Create task
      </Button>,
    );
    const button = screen.getByTestId('create');

    expect(ref.current).toBe(button);
    expect(button.id).toBe('create');
    expect(button.classList.contains('custom')).toBe(true);
    expect(button.classList.contains(styles.button)).toBe(true);
  });
});

describe('Button · variants and sizes', () => {
  it('defaults to primary, md', () => {
    render(<Button>Create task</Button>);
    const button = screen.getByRole('button');

    expect(button.classList.contains(styles.primary)).toBe(true);
    expect(button.classList.contains(styles.md)).toBe(true);
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'applies the %s variant',
    (variant) => {
      render(<Button variant={variant}>Action</Button>);

      expect(
        screen.getByRole('button').classList.contains(styles[variant]),
      ).toBe(true);
    },
  );

  it('applies the sm size', () => {
    render(<Button size="sm">Status</Button>);

    expect(screen.getByRole('button').classList.contains(styles.sm)).toBe(true);
  });
});

describe('Button · content', () => {
  it('renders the icon before the label', () => {
    render(<Button icon={<svg data-testid="icon" />}>Create task</Button>);
    const button = screen.getByRole('button');

    expect(button.firstElementChild).toBe(screen.getByTestId('icon'));
  });

  it('renders the hotkey as inline Kbd after the label — Button picks the view itself (spec)', () => {
    const { container } = render(<Button keys="c">Create task</Button>);
    const kbd = container.querySelector('kbd');

    expect(kbd).not.toBeNull();
    expect(kbd?.getAttribute('data-variant')).toBe('inline');
    expect(screen.getByRole('button').lastElementChild).toBe(kbd);
  });
});

describe('Button · click', () => {
  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create task</Button>);

    fireEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick on a link too', () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <Button href="/board" onClick={onClick}>
        Open board
      </Button>,
    );

    fireEvent.click(screen.getByRole('link'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Button · busy', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is busy at once, while the spinner waits for its delay', () => {
    const { container } = render(<Button loading>Create task</Button>);
    const button = screen.getByRole('button');

    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')).toBeNull();

    advance(raw['spinner-delay']);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('ignores presses while busy — from the first moment, not after the spinner shows', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Create task
      </Button>,
    );

    fireEvent.click(screen.getByRole('button'));
    advance(raw['spinner-delay']);
    fireEvent.click(screen.getByRole('button'));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('puts an xs spinner in place of the icon, hidden from readers', () => {
    const { container } = render(
      <Button loading icon={<svg data-testid="icon" />}>
        Create task
      </Button>,
    );

    advance(raw['spinner-delay']);
    const spinner = container.querySelector<SVGElement>('[role="status"]');

    expect(screen.queryByTestId('icon')).toBeNull();
    expect(spinner?.getAttribute('aria-hidden')).toBe('true');
    expect(spinner?.querySelector('svg')?.getAttribute('viewBox')).toBe(
      `0 0 ${raw['spinner-size-xs']} ${raw['spinner-size-xs']}`,
    );
  });

  it('keeps its accessible name while busy — the spinner does not rename it', () => {
    render(<Button loading>Create task</Button>);
    advance(raw['spinner-delay']);

    screen.getByRole('button', { name: 'Create task' });
  });

  it('is not busy when not loading', () => {
    render(<Button>Create task</Button>);

    expect(screen.getByRole('button').hasAttribute('aria-busy')).toBe(false);
  });
});

describe('Button · disabled', () => {
  it('is natively disabled and ignores clicks', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Archive
      </Button>,
    );
    const button = screen.getByRole('button');

    fireEvent.click(button);

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('turns a disabled link into a non-navigating one', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button href="/board" disabled onClick={onClick}>
        Open board
      </Button>,
    );
    const link = container.querySelector('a') as HTMLAnchorElement;

    fireEvent.click(link);

    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.hasAttribute('disabled')).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('puts the reason on a focusable wrapper as a tooltip trigger', () => {
    const { container } = render(
      <Button disabled disabledReason="Unavailable: no access to this board">
        Archive
      </Button>,
    );
    const wrapper = container.firstElementChild as HTMLElement;

    expect(wrapper.classList.contains(styles.reasonWrapper)).toBe(true);
    expect(wrapper.tabIndex).toBe(0);
    expect(wrapper.getAttribute('data-tooltip-reason')).toBe(
      'Unavailable: no access to this board',
    );
    expect(wrapper.firstElementChild).toBe(screen.getByRole('button'));
  });

  it('makes the reason the accessible description of the button', () => {
    render(
      <Button disabled disabledReason="Unavailable: no access to this board">
        Archive
      </Button>,
    );

    expect(
      screen.getByRole('button', {
        description: 'Unavailable: no access to this board',
      }),
    ).toBeTruthy();
  });

  it('ignores a reason while enabled — no wrapper, no tooltip', () => {
    const { container } = render(
      <Button disabledReason="Unavailable">Archive</Button>,
    );

    expect(container.firstElementChild?.tagName).toBe('BUTTON');
    expect(container.querySelector('[data-tooltip-reason]')).toBeNull();
  });

  it('adds no wrapper for a disabled button without a reason', () => {
    const { container } = render(<Button disabled>Archive</Button>);

    expect(container.firstElementChild?.tagName).toBe('BUTTON');
  });
});
