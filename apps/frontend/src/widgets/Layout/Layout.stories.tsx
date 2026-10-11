import type { Meta, StoryObj } from '@storybook/react-vite';
import { Layout } from './Layout';
import { NIL_WORKSPACE_ID, inboxPath } from '../../shared/constants/routes';

const meta: Meta<typeof Layout> = {
  title: 'Widgets/Layout',
  component: Layout,
  parameters: { layout: 'fullscreen', route: inboxPath(NIL_WORKSPACE_ID) },
};

export default meta;

export const Default: StoryObj<typeof Layout> = {
  render: () => (
    <div style={{ minWidth: 1280 }}>
      <Layout />
    </div>
  ),
};
