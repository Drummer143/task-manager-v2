import { Meta, StoryObj } from '@storybook/react';
import RTEEditor from './RTEEditor';

const meta: Meta<typeof RTEEditor> = {
  title: 'RTE/RTEEditor',
  component: RTEEditor,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof RTEEditor>;

export const Default: Story = {
  parameters: { layout: 'fullscreen' },
};
