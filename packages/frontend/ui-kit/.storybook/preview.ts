import type { Preview } from '@storybook/react-vite';

// Token layer — the single source of theme values. Loaded once for every story
// so components render against real --* variables.
import '../src/tokens/tokens.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true },
  },
};

export default preview;
