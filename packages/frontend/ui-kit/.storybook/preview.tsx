import type { Preview } from '@storybook/react-vite';
import { KitRoot } from '../src/components/KitRoot';

// Token layer — the single source of theme values. Loaded once for every story
// so components render against real --* variables.
import '../src/tokens/tokens.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
  // Every story runs inside the kit root, exactly like the app: tooltips, the
  // layer slot, the Esc ladder and hotkeys work everywhere. Stories must not
  // mount these hosts again.
  decorators: [
    (Story) => (
      <KitRoot>
        <Story />
      </KitRoot>
    ),
  ],
};

export default preview;
