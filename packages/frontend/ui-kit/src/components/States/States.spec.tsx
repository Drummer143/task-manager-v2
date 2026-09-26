import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Refetching } from './Refetching';
import { Skeleton, skeletonWidth } from './Skeleton';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const frameOf = (container: HTMLElement) => container.querySelector('[aria-busy="true"]') as HTMLElement;

describe('Skeleton', () => {
  it('is drawn only after 200 ms — laid out from the start, so nothing shifts', () => {
    vi.useFakeTimers();
    const { container } = render(
      <Skeleton label="Loading board">
        <Skeleton.Line width="40%" />
      </Skeleton>,
    );

    expect(frameOf(container).hasAttribute('data-shown')).toBe(false);
    expect(container.querySelector('[style*="40%"]')).not.toBeNull();

    act(() => vi.advanceTimersByTime(199));
    expect(frameOf(container).hasAttribute('data-shown')).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(frameOf(container).hasAttribute('data-shown')).toBe(true);
  });

  it('is one name for a screen reader; the shapes are hidden', () => {
    const { container } = render(
      <Skeleton label="Loading board" immediate>
        <Skeleton.Block height={64}>
          <Skeleton.Line index={0} />
        </Skeleton.Block>
        <Skeleton.Circle size={18} />
      </Skeleton>,
    );

    expect(frameOf(container).textContent).toBe('Loading board');
    expect(container.querySelector('[aria-hidden="true"]')?.childElementCount).toBe(2);
  });

  it('takes its name from the kit by default', () => {
    render(
      <Skeleton immediate>
        <Skeleton.Line />
      </Skeleton>,
    );

    expect(screen.getByText('Loading')).not.toBeNull();
  });

  it('gives lines by index widths of their own, the same every time', () => {
    expect(skeletonWidth(0)).toBe(skeletonWidth(8));
    expect(skeletonWidth(0)).not.toBe(skeletonWidth(1));

    const { container } = render(
      <Skeleton immediate>
        <Skeleton.Line index={1} />
        <Skeleton.Circle size={18} sunken />
      </Skeleton>,
    );
    const [line, circle] = container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span');

    expect(line.style.width).toBe(skeletonWidth(1));
    expect(circle.style.width).toBe('18px');
    expect(circle.hasAttribute('data-sunken')).toBe(true);
  });
});

describe('EmptyState', () => {
  it('area: the reason, one sentence, the main step with its hotkey', () => {
    const create = vi.fn();
    render(
      <EmptyState
        title="This board has no tasks yet"
        description="Tasks you create here show up in Backlog."
        action={{ label: 'Create task', keys: 'c', onAction: create }}
        secondary={{ label: 'Import', onAction: () => undefined }}
      />,
    );

    expect(screen.getByText('This board has no tasks yet')).not.toBeNull();
    expect(screen.getByText('Tasks you create here show up in Backlog.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Create task/ }));
    expect(create).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('row with one step: the whole line is the button', () => {
    const create = vi.fn();
    render(<EmptyState scale="row" title="No tasks" action={{ label: 'Create', keys: 'c', onAction: create }} />);

    const row = screen.getByRole('button');
    expect(row.textContent).toContain('No tasks');

    fireEvent.click(row);
    expect(create).toHaveBeenCalledOnce();
  });

  it('block: a line with link actions', () => {
    const reset = vi.fn();
    render(<EmptyState scale="block" title="No comments" action={{ label: 'Reset filter', onAction: reset }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset filter' }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it('no action — no button', () => {
    render(<EmptyState title="Inbox zero" description="You’re all caught up." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ErrorState', () => {
  it('says what, why and what happened to the data; Retry retries', () => {
    const retry = vi.fn();
    render(<ErrorState title="Couldn’t load this board" reason="The server didn’t respond." dataSafe="safe" onRetry={retry} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load this board');
    expect(alert.textContent).toContain('The server didn’t respond. Your changes are safe.');

    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('says so when nothing was changed', () => {
    render(<ErrorState title="Couldn’t move the task" dataSafe="unchanged" />);

    expect(screen.getByRole('alert').textContent).toContain('Nothing was changed.');
  });

  it('Enter on the area itself retries; Enter elsewhere in it does not twice', () => {
    const retry = vi.fn();
    render(<ErrorState title="Couldn’t load" onRetry={retry} />);
    const alert = screen.getByRole('alert');

    expect(alert.tabIndex).toBe(-1);
    fireEvent.keyDown(alert, { key: 'Enter' });
    expect(retry).toHaveBeenCalledOnce();

    fireEvent.keyDown(screen.getByRole('button', { name: /Retry/ }), { key: 'Enter' });
    expect(retry).toHaveBeenCalledOnce();
  });

  it('copies the details, never shows them, and says it copied', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<ErrorState title="Couldn’t load" details="E502 · req 7f3a" />);

    expect(screen.getByRole('alert').textContent).not.toContain('E502');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy error details' })));
    expect(writeText).toHaveBeenCalledWith('E502 · req 7f3a');
    expect(screen.getByRole('button', { name: 'Copied' })).not.toBeNull();

    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByRole('button', { name: 'Copy error details' })).not.toBeNull();
  });

  it('an area holds two buttons at most; a row takes all three as links', () => {
    const props = {
      title: 'Upload failed',
      onRetry: () => undefined,
      details: 'E413',
      secondary: { label: 'Remove', onAction: () => undefined },
    };
    const { rerender } = render(<ErrorState {...props} />);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([expect.stringContaining('Retry'), 'Remove']);

    rerender(<ErrorState {...props} scale="row" />);
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Retry', 'Remove', 'Copy error details']);
    // Only an area takes focus and Enter.
    expect(screen.getByRole('alert').hasAttribute('tabindex')).toBe(false);
  });
});

describe('Refetching', () => {
  it('runs a bar over the data; dims it only after a second', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(
      <Refetching active={false}>
        <div>DATA</div>
      </Refetching>,
    );
    const content = () => screen.getByText('DATA').parentElement as HTMLElement;

    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();

    rerender(
      <Refetching active>
        <div>DATA</div>
      </Refetching>,
    );
    expect(screen.getByRole('progressbar', { hidden: true }).getAttribute('aria-label')).toBe('Updating');
    expect((container.firstElementChild as HTMLElement).getAttribute('aria-busy')).toBe('true');
    expect(content().hasAttribute('data-dim')).toBe(false);

    act(() => vi.advanceTimersByTime(1000));
    expect(content().hasAttribute('data-dim')).toBe(true);

    rerender(
      <Refetching active={false}>
        <div>DATA</div>
      </Refetching>,
    );
    expect(content().hasAttribute('data-dim')).toBe(false);
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull();
  });
});
