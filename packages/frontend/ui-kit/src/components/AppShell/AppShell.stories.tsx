import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';
import { cssVar } from '../../tokens';
import { useRegisterHotkey } from '../../interaction/hotkeys';
import { Button } from '../Button';
import { AppShell, type AppShellProps } from './AppShell';
import { toggleSidebar, useShell } from './shellStore';
import { useSidebar } from './SidebarContext';

/*
 * Demo slots. Not part of the kit — they only fill AppShell so its geometry
 * shows: the regions, the one scroll area, the borders, the modes.
 */
const hairline = `${cssVar('border-width')} solid ${cssVar('border-hairline')}`;

const PAGES = ['Board Q3', 'Requirements', 'Retro', 'Mobile', 'Infrastructure'];

/** A sidebar item: an icon and a label; on the rail — the icon alone, the label in a tooltip. */
const Item: React.FC<{ label: string; count?: number }> = ({ label, count }) => {
  const { collapsed, tooltipProps } = useSidebar();

  return (
    <button
      type="button"
      aria-label={collapsed ? label : undefined}
      {...tooltipProps({ text: label })}
      style={{
        width: '100%',
        height: cssVar('row-height'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : undefined,
        gap: cssVar('sp-3'),
        padding: collapsed ? 0 : `0 ${cssVar('sp-3')}`,
        border: 0,
        borderRadius: cssVar('radius-sm'),
        background: 'transparent',
        fontSize: cssVar('type-body'),
        color: cssVar('text-secondary'),
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: cssVar('avatar-sm'),
          height: cssVar('avatar-sm'),
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: cssVar('radius-sm'),
          border: hairline,
          fontSize: cssVar('type-meta'),
        }}
      >
        {label[0]}
      </span>
      {!collapsed && label}
      {!collapsed && count !== undefined && (
        <span style={{ marginLeft: 'auto', fontSize: cssVar('type-meta'), color: cssVar('text-accent') }}>{count}</span>
      )}
    </button>
  );
};

const SidebarDemo: React.FC = () => {
  const { collapsed } = useSidebar();

  return (
    <>
      <div
        style={{
          height: cssVar('canvas-header-height'),
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          padding: `0 ${cssVar('sp-2')}`,
          borderBottom: hairline,
          fontWeight: cssVar('weight-strong'),
        }}
      >
        <Item label="Product" />
      </div>
      <div style={{ padding: cssVar('sp-2'), overflow: 'auto', flex: 1 }}>
        <Item label="Inbox" count={3} />
        {!collapsed && (
          <div style={{ padding: `${cssVar('sp-3')} ${cssVar('sp-3')} ${cssVar('sp-1')}`, fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}>
            Pages
          </div>
        )}
        {PAGES.map((page) => (
          <Item key={page} label={page} />
        ))}
      </div>
    </>
  );
};

const StatusDemo: React.FC = () => {
  const { collapsed, tooltipProps } = useSidebar();

  return (
    <div
      {...tooltipProps({ text: 'Synced · 14:32' })}
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : undefined,
        padding: collapsed ? 0 : `0 ${cssVar('sp-4')}`,
        fontSize: cssVar('type-meta'),
        color: cssVar('text-muted'),
        whiteSpace: 'nowrap',
      }}
    >
      {collapsed ? '●' : 'Synced · 14:32'}
    </div>
  );
};

const HeaderDemo: React.FC<{ onTogglePanel?(): void }> = ({ onTogglePanel }) => {
  const { layout, resetWidths } = useShell();

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', gap: cssVar('sp-3'), padding: `0 ${cssVar('sp-5')}` }}>
      <Button size="sm" variant="ghost" onClick={toggleSidebar} tooltip="Toggle sidebar" keys="Ctrl+\">
        Sidebar
      </Button>
      <span style={{ fontSize: cssVar('type-meta'), color: cssVar('text-muted'), whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {layout.sidebar} · {layout.panel} · canvas {Math.round(layout.canvasPx)} px
      </span>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: cssVar('sp-2') }}>
        {onTogglePanel && (
          <Button size="sm" onClick={onTogglePanel}>
            Toggle panel
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={resetWidths}>
          Reset widths
        </Button>
      </div>
    </div>
  );
};

const CanvasDemo: React.FC = () => (
  <div style={{ padding: cssVar('sp-5'), display: 'flex', flexDirection: 'column', gap: cssVar('card-gap') }}>
    {Array.from({ length: 60 }, (_, index) => (
      <div
        key={index}
        style={{
          padding: cssVar('card-padding'),
          background: cssVar('bg-raised'),
          border: hairline,
          borderRadius: cssVar('radius-sm'),
          fontSize: cssVar('type-body'),
        }}
      >
        <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>TM-{index + 1}</span> A task in
        the one scroll area of the page
      </div>
    ))}
  </div>
);

const PanelDemo: React.FC<{ onClose(): void }> = ({ onClose }) => (
  <>
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
      <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={onClose} keys="Esc" tooltip="Close">
        Close
      </Button>
    </div>
    <div style={{ padding: cssVar('sp-5'), overflow: 'auto', flex: 1, scrollbarGutter: 'stable' }}>
      <div style={{ fontSize: cssVar('type-h1'), fontWeight: cssVar('weight-strong'), marginBottom: cssVar('sp-5') }}>
        AppShell: focus regions and resize
      </div>
      <div style={{ fontSize: cssVar('type-body'), color: cssVar('text-secondary'), lineHeight: cssVar('lh-body') }}>
        Opening the panel leaves focus on the canvas. Closing it with focus inside brings focus back to the canvas.
      </div>
    </div>
  </>
);

/** The app's part: ⌘\ / Ctrl+\ and the panel's open state (in the product: ?task in the URL). */
const Playground: React.FC<Partial<AppShellProps> & { initialPanel?: boolean }> = ({ initialPanel = false, ...args }) => {
  const [open, setOpen] = useState(initialPanel);

  useRegisterHotkey({ key: '\\', ctrl: true, callback: toggleSidebar, description: 'Toggle sidebar' });
  useRegisterHotkey({ key: '\\', meta: true, callback: toggleSidebar, description: 'Toggle sidebar' });

  return (
    <AppShell
      sidebar={<SidebarDemo />}
      status={<StatusDemo />}
      header={<HeaderDemo onTogglePanel={() => setOpen((value) => !value)} />}
      panel={open ? <PanelDemo onClose={() => setOpen(false)} /> : null}
      onPanelClose={() => setOpen(false)}
      {...args}
    >
      <CanvasDemo />
    </AppShell>
  );
};

const meta: Meta<typeof Playground> = {
  title: 'App shell/AppShell',
  component: Playground,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Playground>;

/**
 * Drag the borders (Tab to them: arrows, Shift+arrows, Home/End, Enter to
 * reset; double click resets too). Drag the sidebar below 140 px — it
 * collapses. Ctrl+\ toggles it; narrow the window below 1100 px and Ctrl+\
 * opens it over the canvas. Widths are remembered in localStorage.
 */
export const Default: Story = {};

/** The panel docked: it squeezes the canvas, never below 480 px. Esc closes it. */
export const WithPanel: Story = {
  args: { initialPanel: true },
};

/** A frame narrower than 900 px: the sidebar collapses by itself, the panel goes over the canvas. */
export const Narrow: Story = {
  args: { initialPanel: true },
  decorators: [
    (Story) => (
      <div style={{ width: 860 }}>
        <Story />
      </div>
    ),
  ],
};
