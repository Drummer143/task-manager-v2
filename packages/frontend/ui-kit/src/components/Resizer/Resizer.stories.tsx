import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useRef, useState } from 'react';
import { cssVar, raw } from '../../tokens';
import { Resizer } from './Resizer';

/**
 * A region with a border to drag. `onLive` writes the width straight to the
 * DOM, as AppShell does — React hears only `onCommit`.
 */
const Demo: React.FC<{ collapsible?: boolean }> = ({ collapsible = false }) => {
  const [width, setWidth] = useState<number>(raw['sidebar-width']);
  const [collapsed, setCollapsed] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const shown = collapsed ? raw['sidebar-collapsed'] : width;

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        height: 320,
        border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
        borderRadius: cssVar('radius-md'),
        overflow: 'hidden',
      }}
    >
      <div
        ref={regionRef}
        id="demo-region"
        style={{
          width: shown,
          flex: 'none',
          padding: cssVar('sp-4'),
          background: cssVar('bg-sunken'),
          borderRight: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
          fontSize: cssVar('type-meta'),
          color: cssVar('text-muted'),
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {collapsed ? '—' : `${width} px`}
      </div>
      <div style={{ flex: 1, padding: cssVar('sp-4'), background: cssVar('bg-canvas') }}>Canvas</div>
      <Resizer
        side="sidebar"
        value={shown}
        min={raw['sidebar-min']}
        max={raw['sidebar-max']}
        defaultValue={raw['sidebar-width']}
        snapBelow={collapsible ? raw['sidebar-snap'] : undefined}
        collapsed={collapsed}
        onLive={(px) => {
          if (regionRef.current) {
            regionRef.current.style.width = `${px}px`;
          }
        }}
        onCommit={(px) => {
          if (!collapsed) {
            setWidth(px);
          }
        }}
        onSnap={(next) => {
          setCollapsed(next);

          if (regionRef.current) {
            regionRef.current.style.width = `${next ? raw['sidebar-collapsed'] : width}px`;
          }
        }}
        controls="demo-region"
        label="Resize region"
        style={{ left: `calc(${shown}px - var(--resizer-hit) / 2)` }}
      />
    </div>
  );
};

const meta: Meta<typeof Demo> = {
  title: 'App shell/Resizer',
  component: Demo,
};

export default meta;
type Story = StoryObj<typeof Demo>;

/** Hover (the line lights after 150 ms), drag, or Tab to it: ←→, Shift for 64 px, Home/End, Enter to reset. */
export const Default: Story = {};

/** Narrower than 140 px collapses the region in the same gesture; dragging it back opens it. */
export const Collapsible: Story = {
  args: { collapsible: true },
};
