import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raw } from '../../tokens';
import { isKeyboardFocus } from './isKeyboardFocus';
import TooltipHost from './TooltipHost';
import styles from './TooltipHost.module.scss';
import { tooltipProps } from './tooltipProps';

// jsdom has no reliable :focus-visible — the test decides what "keyboard focus" is.
vi.mock('./isKeyboardFocus', () => ({ isKeyboardFocus: vi.fn(() => false) }));

const DELAY = raw['tooltip-delay'];
const GROUP = raw['tooltip-group-window'];

const tooltip = () => document.body.querySelector<HTMLElement>(`.${styles.root}`);
const shown = () => tooltip()?.textContent ?? null;

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** jsdom may lack PointerEvent: a MouseEvent with a pointerType is what the host reads. */
const pointer = (
  type: 'pointerover' | 'pointerout' | 'pointerdown',
  target: Element,
  { relatedTarget = null, pointerType = 'mouse' }: { relatedTarget?: Element | null; pointerType?: string } = {},
) => {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, relatedTarget });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    target.dispatchEvent(event);
  });
};

const enter = (target: Element, from: Element | null = null) => {
  if (from) pointer('pointerout', from, { relatedTarget: target });
  pointer('pointerover', target, { relatedTarget: from });
};

const leave = (target: Element, to: Element = document.body) => {
  pointer('pointerout', target, { relatedTarget: to });
  pointer('pointerover', to, { relatedTarget: target });
};

const focus = (target: HTMLElement, keyboard: boolean) => {
  vi.mocked(isKeyboardFocus).mockReturnValue(keyboard);
  act(() => target.focus());
};

const bench = () =>
  render(
    <>
      <TooltipHost />
      <button type="button" data-testid="create" {...tooltipProps({ text: 'Create task', keys: 'c' })}>
        <span data-testid="create-icon">+</span>
      </button>
      <button type="button" data-testid="status" {...tooltipProps({ text: 'Status' })}>
        S
      </button>
      <button type="button" data-testid="slow" {...tooltipProps({ text: 'Slow', delay: 1000 })}>
        L
      </button>
      <button type="button" data-testid="plain">
        No tooltip
      </button>
    </>,
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  vi.mocked(isKeyboardFocus).mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TooltipHost · hover', () => {
  it('waits for the token delay — a trigger without a delay attribute is not instant', () => {
    const { getByTestId } = bench();

    enter(getByTestId('status'));
    advance(DELAY - 1);
    expect(tooltip()).toBeNull();

    advance(1);
    expect(shown()).toBe('Status');
  });

  it('honors a per-trigger delay', () => {
    const { getByTestId } = bench();

    enter(getByTestId('slow'));
    advance(DELAY);
    expect(tooltip()).toBeNull();

    advance(1000 - DELAY);
    expect(shown()).toBe('Slow');
  });

  it('never shows on touch or pen', () => {
    const { getByTestId } = bench();

    pointer('pointerover', getByTestId('status'), { pointerType: 'touch' });
    pointer('pointerover', getByTestId('create'), { pointerType: 'pen' });
    advance(DELAY * 2);

    expect(tooltip()).toBeNull();
  });

  it('shows the innermost trigger under the pointer — from any child of it', () => {
    const { getByTestId } = bench();

    enter(getByTestId('create-icon'));
    advance(DELAY);

    expect(shown()).toContain('Create task');
  });

  it('does not hide or restart while moving between children of the same trigger', () => {
    const { getByTestId } = bench();
    const button = getByTestId('create');
    const icon = getByTestId('create-icon');

    enter(button);
    advance(DELAY);
    enter(icon, button);
    enter(button, icon);

    expect(shown()).toContain('Create task');
  });

  it('hides at once when the pointer leaves the trigger', () => {
    const { getByTestId } = bench();
    const button = getByTestId('status');

    enter(button);
    advance(DELAY);
    leave(button);

    expect(tooltip()).toBeNull();
  });

  it('cancels a pending tooltip when the pointer leaves before the delay', () => {
    const { getByTestId } = bench();
    const button = getByTestId('status');

    enter(button);
    advance(DELAY / 2);
    leave(button);
    advance(DELAY);

    expect(tooltip()).toBeNull();
  });

  it('ignores elements without tooltip attributes', () => {
    const { getByTestId } = bench();

    enter(getByTestId('plain'));
    advance(DELAY);

    expect(tooltip()).toBeNull();
  });
});

describe('TooltipHost · toolbar group', () => {
  it('shows the next tooltip at once right after the previous one', () => {
    const { getByTestId } = bench();
    const create = getByTestId('create');
    const status = getByTestId('status');

    enter(create);
    advance(DELAY);
    enter(status, create);

    expect(shown()).toBe('Status');
  });

  it('brings the delay back after the group window', () => {
    const { getByTestId } = bench();
    const create = getByTestId('create');

    enter(create);
    advance(DELAY);
    leave(create);
    advance(GROUP);
    enter(getByTestId('status'));

    expect(tooltip()).toBeNull();
    advance(DELAY);
    expect(shown()).toBe('Status');
  });
});

describe('TooltipHost · keyboard', () => {
  it('shows instantly on keyboard focus', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);

    expect(shown()).toBe('Status');
  });

  it('shows nothing on pointer focus (a click)', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), false);
    advance(DELAY);

    expect(tooltip()).toBeNull();
  });

  it('keeps a keyboard tooltip while the pointer passes by elsewhere', () => {
    const { getByTestId } = bench();
    const status = getByTestId('status');

    focus(status, true);
    enter(getByTestId('create'));
    advance(DELAY);
    leave(getByTestId('create'));

    expect(shown()).toBe('Status');
  });

  it('hides when focus moves away', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);
    focus(getByTestId('plain'), true);

    expect(tooltip()).toBeNull();
  });

  it('moves with keyboard focus to the next trigger', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);
    focus(getByTestId('create'), true);

    expect(shown()).toContain('Create task');
  });
});

describe('TooltipHost · dismiss', () => {
  it('hides on press and stays hidden until the pointer leaves', () => {
    const { getByTestId } = bench();
    const status = getByTestId('status');

    enter(status);
    advance(DELAY);
    pointer('pointerdown', status);
    expect(tooltip()).toBeNull();

    pointer('pointerover', status);
    advance(DELAY);
    expect(tooltip()).toBeNull();

    leave(status);
    advance(GROUP);
    enter(status);
    advance(DELAY);
    expect(shown()).toBe('Status');
  });

  it('hides on Escape without consuming it — the Esc ladder still gets the press', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(event);
    });

    expect(tooltip()).toBeNull();
    expect(event.defaultPrevented).toBe(false);
  });

  it('hides on scroll', () => {
    const { getByTestId } = bench();

    enter(getByTestId('status'));
    advance(DELAY);
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });

    expect(tooltip()).toBeNull();
  });

  it('hides on window resize', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(tooltip()).toBeNull();
  });
});

describe('TooltipHost · trigger lifecycle', () => {
  it('hides when the trigger is removed while shown — even with a still pointer', async () => {
    const view = render(
      <>
        <TooltipHost />
        <div>
          <button type="button" data-testid="row" {...tooltipProps({ text: 'Open task' })} />
        </div>
      </>,
    );

    enter(view.getByTestId('row'));
    advance(DELAY);
    expect(shown()).toBe('Open task');

    view.rerender(
      <>
        <TooltipHost />
        <div />
      </>,
    );
    await act(async () => {
      await Promise.resolve(); // MutationObserver delivers in a microtask
    });

    expect(tooltip()).toBeNull();
  });

  it('updates the text when the trigger attributes change while shown', async () => {
    const Bench = ({ label }: { label: string }) => (
      <>
        <TooltipHost />
        <button type="button" data-testid="watch" {...tooltipProps({ text: label })} />
      </>
    );
    const view = render(<Bench label="Watch" />);

    focus(view.getByTestId('watch'), true);
    view.rerender(<Bench label="Unwatch" />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(shown()).toBe('Unwatch');
  });

  it('stays silent over a trigger whose menu is open', () => {
    const view = render(
      <>
        <TooltipHost />
        <button type="button" data-testid="menu" aria-expanded="true" {...tooltipProps({ text: 'Task actions' })} />
      </>,
    );

    enter(view.getByTestId('menu'));
    advance(DELAY);

    expect(tooltip()).toBeNull();
  });

  it('removes its listeners on unmount', () => {
    const view = bench();
    const status = view.getByTestId('status');

    view.unmount();
    document.body.append(status);
    enter(status);
    advance(DELAY);

    expect(tooltip()).toBeNull();
    status.remove();
  });
});

describe('TooltipHost · content and surface', () => {
  it('renders the keys through Kbd', () => {
    const { getByTestId } = bench();

    focus(getByTestId('create'), true);

    expect(tooltip()?.querySelector('kbd')).not.toBeNull();
  });

  it('shows the disabled reason from a focusable wrapper', () => {
    const view = render(
      <>
        <TooltipHost />
        <span tabIndex={0} data-testid="wrapper" {...tooltipProps({ text: 'Archive', reason: 'Unavailable: no access' })}>
          <button type="button" disabled>
            Archive
          </button>
        </span>
      </>,
    );

    focus(view.getByTestId('wrapper'), true);

    expect(shown()).toBe('Unavailable: no access');
  });

  it('is visual only — hidden from screen readers', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);

    expect(tooltip()?.getAttribute('aria-hidden')).toBe('true');
  });

  it('takes the surface opposite to the one it hangs over', () => {
    const view = render(
      <>
        <TooltipHost />
        <button type="button" data-testid="canvas" {...tooltipProps({ text: 'On canvas' })} />
        <div data-surface="inverse">
          <button type="button" data-testid="bar" {...tooltipProps({ text: 'On selection bar' })} />
        </div>
      </>,
    );

    focus(view.getByTestId('canvas'), true);
    expect(tooltip()?.getAttribute('data-surface')).toBe('inverse');

    focus(view.getByTestId('bar'), true);
    expect(tooltip()?.getAttribute('data-surface')).toBe('default');
  });

  it('positions itself with a transform and reports the actual side', () => {
    const { getByTestId } = bench();

    focus(getByTestId('status'), true);

    expect(tooltip()?.style.transform).toMatch(/^translate3d\(/);
    expect(tooltip()?.dataset.placement).toMatch(/^(top|bottom|left|right)$/);
  });
});
