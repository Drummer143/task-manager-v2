import { createBrowserRouter } from 'react-router-dom';
import { WorkspacePage } from './WorkspacePage';

/**
 * Data router (createBrowserRouter). Route location = { workspace, page };
 * everything else about the view lives in the query string (see view-state).
 */
export const router = createBrowserRouter([
  { path: '/w/:workspace/p/:page', element: <WorkspacePage /> },
]);
