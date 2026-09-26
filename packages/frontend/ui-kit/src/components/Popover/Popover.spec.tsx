import { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Popover } from './Popover';
import { Button } from '../Button';
import { KitRoot } from '../KitRoot';
import { useEscapeStack } from '../../interaction/escape';

const pressEscape = (target: Element = document.activeElement ?? document.body) =>
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });

const Share = ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
  <Popover
    title="Share “Q3 board”"
    trigger={<Button>Share</Button>}
    onOpenChange={onOpenChange}
    footer={<Button variant="primary">Copy link</Button>}
  >
    Anyone in Product can open this board. <a href="#invite">Guests need an invite</a>.
  </Popover>
);

const dialog = () => screen.queryByRole('dialog');

describe('Popover · opening', () => {
  it('opens from its trigger, which holds the "open" look through aria-expanded', async () => {
    render(<Share />);
    const trigger = screen.getByRole('button', { name: 'Share' });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(dialog()).toBeNull();

    fireEvent.click(trigger);

    await screen.findByRole('dialog', { name: 'Share “Q3 board”' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('renders nothing until opened — hundreds of cells cost nothing', () => {
    render(<Share />);

    expect(document.querySelector('[data-layer]')).toBeNull();
  });

  it('lives in a portal on the default surface, marked as a layer', async () => {
    const { container } = render(<Share />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const content = await screen.findByRole('dialog');

    expect(container.contains(content)).toBe(false);
    expect(content.getAttribute('data-surface')).toBe('default');
    expect(content.parentElement?.hasAttribute('data-layer')).toBe(true);
  });

  it('moves focus into the popover on open', async () => {
    render(<Share />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const content = await screen.findByRole('dialog');

    // Which element exactly is Zag's: the first visible interactive one — jsdom
    // has no layout, so here it falls back to the panel; the browser story checks it.
    await waitFor(() => expect(content.contains(document.activeElement)).toBe(true));
  });

  it('focuses initialFocus when given', async () => {
    const Owner = () => {
      const target = useRef<HTMLButtonElement>(null);

      return (
        <Popover title="Share" initialFocus={target} trigger={<Button>Share</Button>}>
          <button type="button">First</button>
          <button type="button" ref={target}>
            Target
          </button>
        </Popover>
      );
    };
    render(<Owner />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Target' })));
  });

  it('is controlled when given open', async () => {
    const Controlled = () => {
      const [open, setOpen] = useState(true);

      return (
        <>
          <Popover open={open} onOpenChange={setOpen} aria-label="Sync" trigger={<Button>Sync</Button>}>
            Synced
          </Popover>
          <button type="button" onClick={() => setOpen(false)}>
            Outside close
          </button>
        </>
      );
    };
    render(<Controlled />);

    await screen.findByRole('dialog', { name: 'Sync' });
    fireEvent.click(screen.getByRole('button', { name: 'Outside close' }));

    await waitFor(() => expect(dialog()).toBeNull());
  });
});

describe('Popover · content', () => {
  it('has a header with the title and ×, a body and a footer', async () => {
    render(<Share />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const content = await screen.findByRole('dialog');

    expect(screen.getByRole('heading', { name: 'Share “Q3 board”' })).toBeTruthy();
    expect(content.textContent).toContain('Anyone in Product');
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
  });

  it('has no × without a title, and is named by aria-label', async () => {
    render(
      <Popover aria-label="Sync status" trigger={<Button>Synced</Button>}>
        All changes are on the server.
      </Popover>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Synced' }));

    await screen.findByRole('dialog', { name: 'Sync status' });
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('takes the × label from KitRoot messages', async () => {
    render(
      <KitRoot messages={{ close: 'Закрыть' }}>
        <Share />
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await screen.findByRole('button', { name: 'Закрыть' });
  });
});

describe('Popover · closing', () => {
  it('closes by × and returns focus to the trigger', async () => {
    render(<Share />);
    const trigger = screen.getByRole('button', { name: 'Share' });

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() => expect(dialog()).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes by Esc — and the Esc ladder does not take a second step', async () => {
    const ladderStep = vi.fn(() => true);
    const Screen = () => {
      // Something below the popover that Esc would otherwise undo (a selection).
      useEscapeStack(ladderStep);

      return <Share />;
    };
    render(
      <KitRoot>
        <Screen />
      </KitRoot>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('dialog');
    await waitFor(() => expect(document.activeElement?.closest('[role="dialog"]')).not.toBeNull());

    pressEscape();

    await waitFor(() => expect(dialog()).toBeNull());
    expect(ladderStep).not.toHaveBeenCalled();

    // With nothing open, the next Esc reaches the ladder as usual.
    pressEscape(document.body);
    expect(ladderStep).toHaveBeenCalledTimes(1);
  });

  it('closes on a second click on the trigger', async () => {
    const onOpenChange = vi.fn();
    render(<Share onOpenChange={onOpenChange} />);
    const trigger = screen.getByRole('button', { name: 'Share' });

    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.click(trigger);

    await waitFor(() => expect(dialog()).toBeNull());
    expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  });

  it('closes when focus leaves it — Tab from the last element goes on past the trigger', async () => {
    render(
      <>
        <Share />
        <button type="button">After the trigger</button>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    const content = await screen.findByRole('dialog');
    // Zag starts watching focus once the popover has settled — as a user would
    // Tab out after it is shown, not in the same millisecond.
    await waitFor(() => expect(content.contains(document.activeElement)).toBe(true));
    const after = screen.getByRole('button', { name: 'After the trigger' });

    act(() => after.focus());

    await waitFor(() => expect(dialog()).toBeNull());
    // Not pulled back to the trigger: focus stays where the user sent it.
    expect(document.activeElement).toBe(after);
  });

  it('stays open while focus moves inside it or back to its trigger', async () => {
    render(<Share />);
    const trigger = screen.getByRole('button', { name: 'Share' });

    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    act(() => screen.getByRole('button', { name: 'Copy link' }).focus());
    act(() => trigger.focus());

    expect(dialog()).not.toBeNull();
  });

  it('closes when its trigger scrolls out of view', async () => {
    let report: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: typeof report) {
          report = callback;
        }
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
    render(<Share />);

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('dialog');
    act(() => report?.([{ isIntersecting: true }]));
    expect(dialog()).not.toBeNull();

    act(() => report?.([{ isIntersecting: false }]));

    await waitFor(() => expect(dialog()).toBeNull());
    vi.unstubAllGlobals();
  });

  it('keeps one overlay at a time: opening the second closes the first', async () => {
    render(
      <>
        <Share />
        <Popover aria-label="Filters" trigger={<Button>Filters</Button>}>
          Filters
        </Popover>
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));
    await screen.findByRole('dialog', { name: 'Share “Q3 board”' });

    // From the keyboard-like path: no pointer-down outside that would close the first.
    act(() => {
      screen.getByRole('button', { name: 'Filters' }).click();
    });

    await screen.findByRole('dialog', { name: 'Filters' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Share “Q3 board”' })).toBeNull());
  });
});
