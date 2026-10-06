import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect } from 'react';
import { AppShell, cssVar, toggleSidebar, useShell, type MenuItem } from '@task-manager-v2/ui-kit';
import { ArrowUpRightIcon, InboxIcon } from '@task-manager-v2/ui-kit/icons';
import { NavItem } from './NavItem';

const meta: Meta<typeof NavItem> = {
  title: 'Shared/NavItem',
  component: NavItem,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof NavItem>;

/** Wider than the 1100 px at which the sidebar collapses by itself: only `rail` decides. */
const FRAME_WIDTH = 1280;

/**
 * The rows in a real AppShell sidebar. NavItem takes rail or full from the
 * frame, and the frame decides by its own width — outside one, by the
 * Storybook window's, which is usually narrow. The story also sets the
 * collapse itself, whatever an earlier story left in storage.
 */
const InSidebar: React.FC<{ rail?: boolean; children: React.ReactNode }> = ({ rail = false, children }) => {
  const { prefs } = useShell();

  useLayoutEffect(() => {
    if (prefs.sidebarCollapsed !== rail) {
      toggleSidebar();
    }
  }, [rail, prefs.sidebarCollapsed]);

  return (
    <div style={{ width: FRAME_WIDTH, height: 360, overflow: 'hidden' }}>
      <AppShell
        sidebar={<div style={{ display: 'grid', paddingBlock: cssVar('sp-3'), gap: rail ? cssVar('sp-2') : 0 }}>{children}</div>}
        header={null}
      >
        {null}
      </AppShell>
    </div>
  );
};

const MENU: MenuItem[] = [
  { type: 'action', id: 'tab', label: 'Open in new tab' },
  { type: 'action', id: 'rename', label: 'Rename' },
  { type: 'action', id: 'unstar', label: 'Remove from favorites' },
  { type: 'separator' },
  { type: 'action', id: 'delete', label: 'Delete', danger: true },
];

export const Default: Story = {
  args: { href: '/inbox', icon: <InboxIcon />, label: 'Inbox', count: 12 },
  render: (args) => (
    <InSidebar>
      <NavItem {...args} />
    </InSidebar>
  ),
};

/** Spec 03: the states, live — hover a row for its ⋯, right click or Shift+F10 for its menu. */
export const States: Story = {
  render: () => (
    <InSidebar>
      <NavItem href="/inbox" icon={<InboxIcon />} label="Inbox" count={12} keys="g i" />
      <NavItem href="/inbox" icon={<InboxIcon />} label="Inbox · all read" />
      <NavItem href="/inbox" icon={<InboxIcon />} label="Inbox · over 99" count={240} />
      <NavItem href="/p/board" icon={<ArrowUpRightIcon />} label="Product board" current menu={MENU} />
      <NavItem href="/p/notes" icon={<ArrowUpRightIcon />} label="Roadmap notes" dot menu={MENU} />
      <NavItem
        href="/p/plan"
        icon={<ArrowUpRightIcon />}
        label="Quarterly planning notes and decisions for the next year"
        menu={MENU}
      />
    </InSidebar>
  ),
};

/** Spec 05: on the rail only the icon stays; the name, the count and the hotkey are in the tooltip. */
export const Rail: Story = {
  render: () => (
    <InSidebar rail>
      <NavItem href="/inbox" icon={<InboxIcon />} label="Inbox" count={12} keys="g i" />
      <NavItem href="/p/board" icon={<ArrowUpRightIcon />} label="Product board" current />
      <NavItem href="/p/notes" icon={<ArrowUpRightIcon />} label="Roadmap notes" dot />
    </InSidebar>
  ),
};
