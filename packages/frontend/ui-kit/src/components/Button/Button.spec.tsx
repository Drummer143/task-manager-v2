import { createRef } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raw } from '../../tokens';
import { Button } from './Button';
import styles from './Button.module.scss';
import { KitRoot } from '../KitRoot';
import { isKeyboardFocus } from '../Tooltip/isKeyboardFocus';
import type { RouterAdapter } from '../../router';

// jsdom has no reliable :focus-visible — every focus here counts as keyboard focus.
vi.mock('../Tooltip/isKeyboardFocus', () => ({ isKeyboardFocus: vi.fn(() => true) }));

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
      <Button href="/export.csv" target="_self" rel="nofollow" download="export.csv">
        Export
      </Button>,
    );
    const link = screen.getByRole('link');

    expect(link.getAttribute('target')).toBe('_self');
    expect(link.getAttribute('rel')).toBe('nofollow');
    expect(link.getAttribute('download')).toBe('export.csv');
  });

  it('adds noopener noreferrer to a _blank link, keeping its own rel', () => {
    render(
      <Button href="https://example.com" target="_blank" rel="nofollow noopener">
        Docs
      </Button>,
    );

    expect(screen.getByRole('link').getAttribute('rel')).toBe('nofollow noopener noreferrer');
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
  it('defaults to secondary, md — primary is the one main action, chosen on purpose', () => {
    render(<Button>Create task</Button>);
    const button = screen.getByRole('button');

    expect(button.classList.contains(styles.secondary)).toBe(true);
    expect(button.classList.contains(styles.md)).toBe(true);
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('applies the %s variant', (variant) => {
    render(<Button variant={variant}>Action</Button>);

    expect(screen.getByRole('button').classList.contains(styles[variant])).toBe(true);
  });

  it('applies the sm size', () => {
    render(<Button size="sm">Status</Button>);

    expect(screen.getByRole('button').classList.contains(styles.sm)).toBe(true);
  });
});

describe('Button · content', () => {
  it('puts the icon in a decorative slot before the label', () => {
    render(<Button icon={<svg data-testid="icon" />}>Create task</Button>);
    const button = screen.getByRole('button');
    const slot = button.firstElementChild as HTMLElement;

    expect(slot.classList.contains(styles.icon)).toBe(true);
    expect(slot.classList.contains(styles.glyph)).toBe(true);
    expect(slot.getAttribute('aria-hidden')).toBe('true');
    expect(slot.firstElementChild).toBe(screen.getByTestId('icon'));
  });

  it('renders no slot without an icon', () => {
    render(<Button>Create task</Button>);

    expect(screen.getByRole('button').querySelector(`.${styles.icon}`)).toBeNull();
  });

  it('renders the hotkey as inline Kbd after the label — Button picks the view itself (spec)', () => {
    const { container } = render(<Button keys="c">Create task</Button>);
    const kbd = container.querySelector('kbd');

    expect(kbd).not.toBeNull();
    expect(kbd?.getAttribute('data-variant')).toBe('inline');
    expect(screen.getByRole('button').lastElementChild).toBe(kbd);
  });

  it('is square with an icon and no label, and renders no inline hotkey there', () => {
    const { container } = render(<Button icon={<svg />} aria-label="Add task" keys="c" />);
    const button = screen.getByRole('button', { name: 'Add task' });

    expect(button.classList.contains(styles.iconOnly)).toBe(true);
    expect(container.querySelector('kbd')).toBeNull();
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

  const spinnerBox = (container: HTMLElement) =>
    container.querySelector('[role="status"] svg')?.getAttribute('viewBox');

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

  it('puts an xs spinner in the icon slot next to a label, hidden from readers', () => {
    const { container } = render(
      <Button loading icon={<svg data-testid="icon" />}>
        Create task
      </Button>,
    );

    advance(raw['spinner-delay']);
    const slot = container.querySelector(`.${styles.icon}`);

    expect(screen.queryByTestId('icon')).toBeNull();
    expect(slot?.getAttribute('aria-hidden')).toBe('true');
    // The spinner keeps its own geometry: the icon rules do not apply to it.
    expect(slot?.classList.contains(styles.glyph)).toBe(false);
    expect(spinnerBox(container)).toBe(`0 0 ${raw['spinner-size-xs']} ${raw['spinner-size-xs']}`);
  });

  it('puts an sm spinner — the icon size — in an icon-only button', () => {
    const { container } = render(<Button loading icon={<svg />} aria-label="Copy link" />);

    advance(raw['spinner-delay']);

    expect(spinnerBox(container)).toBe(`0 0 ${raw['spinner-size-sm']} ${raw['spinner-size-sm']}`);
  });

  it('puts the spinner in place of the label when there is no icon — the label stays for width and name', () => {
    const { container } = render(
      <Button loading keys="c">
        Create task
      </Button>,
    );

    advance(raw['spinner-delay']);
    const hidden = container.querySelector(`.${styles.labelHidden}`);
    const overlay = container.querySelector(`.${styles.spinnerOverlay}`);

    expect(hidden?.textContent).toContain('Create task');
    expect(hidden?.querySelector('kbd')).not.toBeNull();
    expect(overlay?.getAttribute('aria-hidden')).toBe('true');
    expect(overlay?.querySelector('[role="status"]')).not.toBeNull();
    expect(container.querySelector(`.${styles.icon}`)).toBeNull();
    screen.getByRole('button', { name: /Create task/ });
  });

  it('keeps the label as is with an icon — only the icon gives way', () => {
    const { container } = render(
      <Button loading icon={<svg />}>
        Create task
      </Button>,
    );

    advance(raw['spinner-delay']);

    expect(container.querySelector(`.${styles.labelHidden}`)).toBeNull();
    expect(container.querySelector(`.${styles.spinnerOverlay}`)).toBeNull();
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
  it('is aria-disabled, not natively disabled — it keeps focus and ignores clicks', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Archive
      </Button>,
    );
    const button = screen.getByRole('button');

    fireEvent.click(button);

    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(onClick).not.toHaveBeenCalled();

    act(() => button.focus());
    expect(document.activeElement).toBe(button);
  });

  it('does not submit a form while disabled', () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" disabled>
          Save
        </Button>
      </form>,
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('turns a disabled link into a non-navigating one that is still reachable', () => {
    const onClick = vi.fn();
    render(
      <Button href="/board" disabled onClick={onClick}>
        Open board
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Open board' });

    fireEvent.click(link);

    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.tabIndex).toBe(0);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('carries the reason itself — no wrapper around it', () => {
    const { container } = render(
      <Button disabled disabledReason="Unavailable: no access to this board">
        Archive
      </Button>,
    );
    const button = screen.getByRole('button');

    expect(container.firstElementChild).toBe(button);
    expect(button.getAttribute('data-tooltip-reason')).toBe('Unavailable: no access to this board');
  });

  it('is described by its reason while the tooltip shows it', () => {
    vi.mocked(isKeyboardFocus).mockReturnValue(true);
    render(
      <KitRoot>
        <Button disabled disabledReason="Unavailable: no access to this board">
          Archive
        </Button>
      </KitRoot>,
    );

    act(() => screen.getByRole('button').focus());

    screen.getByRole('button', { description: 'Unavailable: no access to this board' });
  });

  it('ignores a reason while enabled', () => {
    render(<Button disabledReason="Unavailable">Archive</Button>);

    expect(screen.getByRole('button').hasAttribute('data-tooltip-reason')).toBe(false);
  });
});

describe('Button · tooltip', () => {
  it('shows its tooltip with the hotkey', () => {
    render(
      <Button tooltip="Create a task in this status" keys="c" tooltipPlacement="bottom">
        Create task
      </Button>,
    );
    const button = screen.getByRole('button');

    expect(button.getAttribute('data-tooltip')).toBe('Create a task in this status');
    expect(button.getAttribute('data-tooltip-keys')).toBe('c');
    expect(button.getAttribute('data-tooltip-placement')).toBe('bottom');
  });

  it('keeps the text next to a reason — the host shows the reason', () => {
    render(
      <Button tooltip="Archive the board" disabled disabledReason="Unavailable">
        Archive
      </Button>,
    );
    const button = screen.getByRole('button');

    expect(button.getAttribute('data-tooltip')).toBe('Archive the board');
    expect(button.getAttribute('data-tooltip-reason')).toBe('Unavailable');
  });

  it('is no tooltip trigger without a tooltip or a reason', () => {
    render(<Button keys="c">Create task</Button>);
    const button = screen.getByRole('button');

    expect(button.hasAttribute('data-tooltip')).toBe(false);
    expect(button.hasAttribute('data-tooltip-keys')).toBe(false);
  });
});

describe('Button · router', () => {
  // jsdom cannot navigate: a listener after React's (on window) stops the
  // browser part of a click and records whether the kit had already taken it.
  let prevented: boolean | undefined;
  const stopBrowser = (event: MouseEvent) => {
    prevented = event.defaultPrevented;
    event.preventDefault();
  };

  beforeEach(() => {
    prevented = undefined;
    window.addEventListener('click', stopBrowser);
  });

  afterEach(() => {
    window.removeEventListener('click', stopBrowser);
  });

  const setup = (element: React.ReactElement, adapter: Partial<RouterAdapter> = {}) => {
    const router = { navigate: vi.fn(), ...adapter };
    render(<KitRoot router={router}>{element}</KitRoot>);

    return { router, link: screen.getByRole('link') };
  };

  it('navigates through the adapter on a plain click, without a reload', () => {
    const { router, link } = setup(<Button href="/w/acme/board">Open board</Button>);

    fireEvent.click(link);

    expect(router.navigate).toHaveBeenCalledWith('/w/acme/board');
    expect(prevented).toBe(true);
  });

  it('puts the adapter href on the link', () => {
    const { link } = setup(<Button href="/board">Open board</Button>, {
      useHref: (href) => `/app${href}`,
    });

    expect(link.getAttribute('href')).toBe('/app/board');
  });

  it.each([
    ['a ⌘-click', { metaKey: true }],
    ['a Ctrl-click', { ctrlKey: true }],
    ['a Shift-click', { shiftKey: true }],
    ['a non-primary button', { button: 1 }],
  ])('leaves %s to the browser', (_, init) => {
    const { router, link } = setup(<Button href="/board">Open board</Button>);

    fireEvent.click(link, init);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it.each([
    ['an external link', <Button href="https://example.com">Docs</Button>],
    ['mailto:', <Button href="mailto:team@example.com">Write</Button>],
    ['an in-page anchor', <Button href="#comments">Comments</Button>],
    [
      'target="_blank"',
      <Button href="/board" target="_blank">
        Open board
      </Button>,
    ],
    [
      'a download',
      <Button href="/export.csv" download>
        Export
      </Button>,
    ],
  ])('does not intercept %s', (_, element) => {
    const { router, link } = setup(element);

    fireEvent.click(link);

    expect(router.navigate).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });

  it('lets onClick cancel the navigation with preventDefault', () => {
    const { router, link } = setup(
      <Button href="/board" onClick={(event) => event.preventDefault()}>
        Open board
      </Button>,
    );

    fireEvent.click(link);

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('blocks navigation while busy, keeping the href', () => {
    const { router, link } = setup(
      <Button href="/board" loading>
        Open board
      </Button>,
    );

    fireEvent.click(link);

    expect(link.getAttribute('href')).toBe('/board');
    expect(link.getAttribute('aria-busy')).toBe('true');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
