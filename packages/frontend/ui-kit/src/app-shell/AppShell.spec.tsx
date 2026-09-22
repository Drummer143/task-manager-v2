import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

test('renders every region and keeps the panel out when closed', () => {
  render(
    <AppShell sidebar={<div>NAV</div>} header={<div>HEAD</div>} status={<div>SYNC</div>}>
      <div>CANVAS</div>
    </AppShell>
  );

  // getByText throws if missing, so these act as assertions.
  screen.getByText('NAV');
  screen.getByText('HEAD');
  screen.getByText('CANVAS');
  screen.getByText('SYNC');
  expect(screen.queryByText('PANEL')).toBeNull();
});

test('shows the panel when a panel slot is provided', () => {
  render(
    <AppShell sidebar={null} header={null} panel={<div>PANEL</div>}>
      <div>CANVAS</div>
    </AppShell>
  );

  screen.getByText('PANEL');
});

test('shows a resize handle only when its change handler is present', () => {
  const noop = () => undefined;
  const { rerender } = render(
    <AppShell sidebar={null} header={null} onSidebarWidthChange={noop}>
      <div>CANVAS</div>
    </AppShell>
  );

  screen.getByRole('separator', { name: 'Resize sidebar' });
  // No panel → no panel handle, even with a handler.
  expect(screen.queryByRole('separator', { name: 'Resize panel' })).toBeNull();

  // Collapsed sidebar hides its handle.
  rerender(
    <AppShell sidebar={null} header={null} sidebarCollapsed onSidebarWidthChange={noop}>
      <div>CANVAS</div>
    </AppShell>
  );
  expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).toBeNull();
});
