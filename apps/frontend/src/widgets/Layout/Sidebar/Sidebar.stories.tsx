import type { Meta, StoryObj } from '@storybook/react-vite';
import { useLayoutEffect } from 'react';
import { AppShell, toggleSidebar, useShell } from '@task-manager-v2/ui-kit';
import { Sidebar, type SidebarProps } from './Sidebar';

const meta: Meta<typeof Sidebar> = {
  title: 'Widgets/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof Sidebar>;

/** Wider than the 1100 px at which the sidebar collapses by itself: only `rail` decides. */
const FRAME_WIDTH = 1280;

const verso = { id: 'w1', slug: 'verso', name: 'Verso team' };
const workspaces = [
  verso,
  { id: 'w2', slug: 'side', name: 'Side project' },
  { id: 'w3', slug: 'acme', name: 'Acme Research & Development' },
];

const props: SidebarProps = {
  switcher: {
    workspace: verso,
    workspaces,
    user: { id: 'u1', name: 'Alex Kim', email: 'alex@verso.dev' },
    unreadByWorkspace: { w2: 3 },
    canWorkspaceSettings: true,
    canInvite: true,
    onWorkspaceChange: () => undefined,
    onSignOut: () => undefined,
    onOpenSettings: () => undefined,
    onInvite: () => undefined,
    onNewWorkspace: () => undefined,
  },
  inbox: { href: '/verso/inbox', unread: 12, current: true },
};

/**
 * The sidebar in a real AppShell: it takes rail or full from the frame, and the frame decides by
 * its own width. The story also sets the collapse itself, whatever an earlier story left.
 */
const InShell: React.FC<{ rail?: boolean; sidebar: SidebarProps }> = ({ rail = false, sidebar }) => {
  const { prefs } = useShell();

  useLayoutEffect(() => {
    if (prefs.sidebarCollapsed !== rail) {
      toggleSidebar();
    }
  }, [rail, prefs.sidebarCollapsed]);

  return (
    <div style={{ width: FRAME_WIDTH, height: 480, overflow: 'hidden' }}>
      <AppShell sidebar={<Sidebar {...sidebar} />} header={null}>
        {null}
      </AppShell>
    </div>
  );
};

export const Default: Story = { render: () => <InShell sidebar={props} /> };

/** No role: the workspaces and the account only. */
export const Guest: Story = {
  render: () => (
    <InShell sidebar={{ ...props, switcher: { ...props.switcher, canWorkspaceSettings: false, canInvite: false } }} />
  ),
};

/** A name too long for the sidebar: an ellipsis, the whole of it in a tooltip. */
export const LongName: Story = {
  render: () => <InShell sidebar={{ ...props, switcher: { ...props.switcher, workspace: workspaces[2] } }} />,
};

/** The workspace is not known yet: the frame is there in the first frame, its name a skeleton. */
export const Loading: Story = {
  render: () => (
    <InShell sidebar={{ ...props, switcher: { ...props.switcher, workspace: null }, inbox: { href: '/verso/inbox' } }} />
  ),
};

export const Rail: Story = { render: () => <InShell rail sidebar={props} /> };
