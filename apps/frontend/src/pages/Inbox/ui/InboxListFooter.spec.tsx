import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KitRoot } from '@task-manager-v2/ui-kit';
import { InboxListFooter } from './InboxListFooter';

const setup = (props: { loading?: boolean; failed?: boolean }) => {
  const onRetry = vi.fn();
  render(
    <KitRoot>
      <div role="grid" aria-label="Notifications">
        <InboxListFooter loading={false} failed={false} rowIndex={51} onRetry={onRetry} {...props} />
      </div>
    </KitRoot>,
  );

  return { onRetry };
};

describe('InboxListFooter', () => {
  it('renders nothing while nothing is loading or failed', () => {
    setup({});

    expect(screen.queryByRole('row')).toBeNull();
  });

  it('is a row with one busy cell after the loaded rows while the next page loads', () => {
    setup({ loading: true });

    const row = screen.getByRole('row');
    expect(row.getAttribute('aria-rowindex')).toBe('51');
    expect(screen.getByRole('gridcell').getAttribute('aria-busy')).toBe('true');
    expect(row.textContent).toBe('Loading…');
  });

  it('offers a retry when the next page failed', () => {
    const { onRetry } = setup({ failed: true });

    expect(screen.getByRole('gridcell').hasAttribute('aria-busy')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
