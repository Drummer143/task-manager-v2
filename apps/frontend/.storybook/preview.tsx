import { useMemo } from 'react';
import type { Preview } from '@storybook/react-vite';
import { MemoryRouter, useHref, useNavigate } from 'react-router-dom';
import { KitRoot, type RouterAdapter } from '@task-manager-v2/ui-kit';

// As in main.tsx: the token layer first, then the app's own base styles
import '@task-manager-v2/ui-kit/tokens.css';
import '../src/styles.css';

/** The kit's links go through this story's router, as through the app's. */
const KitWithRouter: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const router = useMemo<RouterAdapter>(
    () => ({ navigate: (href, options) => navigate(href, options), useHref }),
    [navigate],
  );

  return <KitRoot router={router}>{children}</KitRoot>;
};

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
  // Every story is inside a router (at `parameters.route`, default '/') and the kit root, like
  // the app: screens may read the URL, and kit links, tooltips and layers work
  decorators: [
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[(parameters.route as string | undefined) ?? '/']}>
        <KitWithRouter>
          <Story />
        </KitWithRouter>
      </MemoryRouter>
    ),
  ],
};

export default preview;
