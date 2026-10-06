import type { Meta, StoryObj } from '@storybook/react-vite';
import { Layout } from './Layout';

const meta: Meta<typeof Layout> = {
  title: 'Widgets/Layout',
  component: Layout,
  parameters: { layout: 'fullscreen', route: '/inbox' },
};

export default meta;

export const Default: StoryObj<typeof Layout> = {
  render: () => (
    <div style={{ minWidth: 1280 }}>
      <Layout />
    </div>
  ),
};
