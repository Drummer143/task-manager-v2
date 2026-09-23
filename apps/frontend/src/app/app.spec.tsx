import { fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';

function renderAt(entry: string) {
  const router = createMemoryRouter([{ path: '/w/:workspace/p/:page', element: <WorkspacePage /> }], {
    initialEntries: [entry],
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe('view-state via the URL', () => {
  it('switching the view writes it to the query (replace)', () => {
    const router = renderAt('/w/product/p/board-q3');
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(router.state.location.search).toContain('view=table');
  });

  it('opening a task pushes ?task to the URL', () => {
    const router = renderAt('/w/product/p/board-q3');
    fireEvent.click(screen.getByRole('button', { name: /Extract the token layer/ }));
    expect(router.state.location.search).toContain('task=TM-1');
  });

  it('defaults are not written to the query', () => {
    const router = renderAt('/w/product/p/board-q3?view=table');
    fireEvent.click(screen.getByRole('button', { name: 'Board' }));
    // Back to the default view → the param drops out entirely.
    expect(router.state.location.search).not.toContain('view=');
  });
});
