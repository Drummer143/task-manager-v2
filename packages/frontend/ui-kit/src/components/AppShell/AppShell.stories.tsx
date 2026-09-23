import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import { AppShell } from './AppShell';
import type { AppShellProps } from './AppShell';
import { cssVar, raw } from '../../tokens';

/**
 * Demo slots. Not part of the kit — they only fill AppShell so its geometry is
 * visible: regions, the single scroll area, and the panel compressing the canvas.
 */
const hairline = `${cssVar('border-width')} solid ${cssVar('border-hairline')}`;

function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        height: cssVar('row-height'),
        display: 'flex',
        alignItems: 'center',
        gap: cssVar('sp-3'),
        padding: `0 ${cssVar('sp-3')}`,
        borderRadius: cssVar('radius-sm'),
        fontSize: cssVar('type-body'),
        color: cssVar('text-secondary'),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SidebarDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: cssVar('canvas-header-height'),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: cssVar('sp-3'),
          padding: `0 ${cssVar('sp-4')}`,
          borderBottom: hairline,
          fontWeight: cssVar('weight-strong'),
        }}
      >
        <span
          style={{
            width: cssVar('avatar-sm'),
            height: cssVar('avatar-sm'),
            borderRadius: cssVar('radius-sm'),
            background: cssVar('bg-raised'),
            border: hairline,
          }}
        />
        Product
      </div>
      <div style={{ padding: cssVar('sp-2'), overflow: 'auto', flex: 1 }}>
        <Row>Board Q3</Row>
        <Row>Requirements</Row>
        <Row>Retro</Row>
        <Row>Mobile</Row>
        <Row>Infrastructure</Row>
      </div>
      <Row style={{ flex: 'none', borderTop: hairline, color: cssVar('text-primary') }}>
        Inbox
        <span
          style={{
            marginLeft: 'auto',
            fontSize: cssVar('type-meta'),
            color: cssVar('text-accent'),
            background: cssVar('bg-accent-soft'),
            borderRadius: cssVar('radius-full'),
            padding: `0 ${cssVar('sp-2')}`,
          }}
        >
          3
        </span>
      </Row>
    </div>
  );
}

function StatusDemo() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: `0 ${cssVar('sp-4')}`,
        fontSize: cssVar('type-meta'),
        color: cssVar('text-muted'),
      }}
    >
      Synced · 14:32
    </div>
  );
}

function HeaderDemo() {
  const chip: CSSProperties = {
    height: cssVar('control-height-sm'),
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${cssVar('sp-3')}`,
    border: hairline,
    borderRadius: cssVar('radius-sm'),
    fontSize: cssVar('type-meta'),
    color: cssVar('text-secondary'),
  };
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: cssVar('sp-4'),
        padding: `0 ${cssVar('sp-5')}`,
      }}
    >
      <div style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>
        Product / Web /{' '}
        <span style={{ color: cssVar('text-primary'), fontWeight: cssVar('weight-strong') }}>
          Board Q3
        </span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: cssVar('sp-3') }}>
        <div style={{ ...chip, color: cssVar('text-accent'), borderColor: cssVar('border-accent') }}>
          Board
        </div>
        <div style={chip}>Table</div>
        <div style={chip}>Group: status</div>
      </div>
    </div>
  );
}

function Card({ title, muted }: { title: string; muted?: boolean }) {
  return (
    <div
      style={{
        background: cssVar('bg-raised'),
        border: hairline,
        borderRadius: cssVar('radius-sm'),
        padding: cssVar('card-padding'),
        fontSize: cssVar('type-body'),
        color: muted ? cssVar('text-muted') : cssVar('text-primary'),
        boxShadow: cssVar('shadow-raised'),
      }}
    >
      {title}
    </div>
  );
}

function Column({ title, count, children }: { title: string; count: number; children?: ReactNode }) {
  return (
    <div
      style={{
        width: cssVar('column-width'),
        flex: 'none',
        background: cssVar('bg-sunken'),
        border: hairline,
        borderRadius: cssVar('radius-md'),
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: cssVar('row-height'),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: cssVar('sp-3'),
          padding: `0 ${cssVar('sp-4')}`,
          borderBottom: hairline,
        }}
      >
        <span style={{ fontWeight: cssVar('weight-strong'), fontSize: cssVar('type-h3') }}>{title}</span>
        <span style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>{count}</span>
      </div>
      <div
        style={{
          padding: cssVar('sp-3'),
          display: 'flex',
          flexDirection: 'column',
          gap: cssVar('card-gap'),
        }}
      >
        {children}
      </div>
    </div>
  );
}

function CanvasDemo() {
  return (
    <div style={{ display: 'flex', gap: cssVar('column-gap'), padding: cssVar('sp-4'), height: '100%' }}>
      <Column title="Backlog" count={12}>
        <Card title="Extract the token layer into a package" />
        <Card title='Shortcut registry + "?" cheatsheet' muted />
      </Column>
      <Column title="In progress" count={4}>
        <Card title="AppShell: focus regions and resize" />
      </Column>
      <Column title="Review" count={0} />
      <Column title="Done" count={18} />
      <Column title="Ideas" count={7} />
      <Column title="Frozen" count={2} />
    </div>
  );
}

function PanelDemo() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          height: cssVar('canvas-header-height'),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${cssVar('sp-5')}`,
          borderBottom: hairline,
          fontSize: cssVar('type-meta'),
          color: cssVar('text-muted'),
        }}
      >
        TM-248
        <span style={{ marginLeft: 'auto' }}>Esc</span>
      </div>
      <div style={{ padding: cssVar('sp-5'), overflow: 'auto', flex: 1 }}>
        <div style={{ fontSize: cssVar('type-h1'), fontWeight: cssVar('weight-strong'), marginBottom: cssVar('sp-5') }}>
          AppShell: focus regions and resize
        </div>
        <div style={{ fontSize: cssVar('type-body'), color: cssVar('text-secondary'), lineHeight: cssVar('lh-body') }}>
          Lay out the four regions, resize the sidebar and panel with width persisted. On closing
          the panel, focus returns to the card it was opened from.
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps AppShell with local width state so the resize handles are live in
 * Storybook. In the product this state comes from the view/layout store.
 */
function Interactive(args: AppShellProps) {
  const [sidebarWidth, setSidebarWidth] = useState(args.sidebarWidth ?? raw['sidebar-width']);
  const [panelWidth, setPanelWidth] = useState(args.panelWidth ?? raw['panel-width']);
  return (
    <AppShell
      {...args}
      sidebarWidth={sidebarWidth}
      onSidebarWidthChange={setSidebarWidth}
      panelWidth={panelWidth}
      onPanelWidthChange={setPanelWidth}
    />
  );
}

const meta: Meta<typeof AppShell> = {
  title: 'App shell/AppShell',
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  render: (args) => <Interactive {...args} />,
  decorators: [
    (Story) => (
      <div style={{ height: '100vh', overflow: 'hidden' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    sidebar: <SidebarDemo />,
    header: <HeaderDemo />,
    status: <StatusDemo />,
    children: <CanvasDemo />,
  },
};

export default meta;
type Story = StoryObj<typeof AppShell>;

/** Board, task panel closed — the default state. */
export const Default: Story = {};

/** Task panel open: it compresses the canvas rather than overlaying it. */
export const WithPanel: Story = {
  args: { panel: <PanelDemo /> },
};

/** Sidebar collapsed to the icon rail. */
export const CollapsedSidebar: Story = {
  args: { sidebarCollapsed: true },
};
