import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useState } from 'react';
import { Popover } from './Popover';
import { Button } from '../Button';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const row: CSSProperties = { display: 'flex', gap: cssVar('sp-6'), alignItems: 'flex-start', flexWrap: 'wrap' };

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

function SharePopover({ side, align }: { side?: 'bottom' | 'top' | 'right' | 'left'; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side={side}
      align={align}
      title="Share “Q3 board”"
      trigger={<Button size="sm">Share</Button>}
      footer={
        <>
          <Button size="sm" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
            Copy link
          </Button>
        </>
      }
    >
      Anyone in <strong>Product</strong> can open this board. <a href="#invite">Guests need an invite</a>.
    </Popover>
  );
}

const meta: Meta<typeof Popover> = {
  title: 'Primitives/Popover',
  component: Popover,
  parameters: { layout: 'padded' },
};

export default meta;
type Story = StoryObj<typeof Popover>;

/**
 * Title, body, footer. Focus goes to the first interactive element; Tab walks
 * the popover and from its last element leaves to what follows the trigger;
 * Esc or × closes and returns focus to the trigger; a click outside closes and
 * still does its own thing.
 */
export const Share: Story = {
  render: () => (
    <div style={row}>
      <SharePopover />
      <Button size="sm">After the trigger</Button>
    </div>
  ),
};

/** Without a title — no × either; it needs an aria-label. */
export const WithoutTitle: Story = {
  render: () => (
    <Popover aria-label="Sync status" trigger={<Button size="sm">Synced 2 min ago</Button>}>
      All changes are on the server. The next check runs in 30 s.
    </Popover>
  ),
};

/** bottom-start by default; at an edge it flips, then slides along — it never leaves an 8 px margin. */
export const Placement: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div style={{ position: 'absolute', left: cssVar('sp-6'), top: cssVar('sp-6') }}>
        <SharePopover />
      </div>
      <div style={{ position: 'absolute', right: cssVar('sp-6'), top: cssVar('sp-6') }}>
        <SharePopover align="end" />
      </div>
      <div style={{ position: 'absolute', left: cssVar('sp-6'), bottom: cssVar('sp-6') }}>
        <SharePopover />
      </div>
      <div style={{ position: 'absolute', left: '40%', top: '40%' }}>
        <SharePopover side="right" />
      </div>
      <Caption>Top left: bottom-start. Top right: bottom-end. Bottom left: flips to top. Centre: right-start.</Caption>
    </div>
  ),
};

/** One overlay at a time: opening the second closes the first — also from the keyboard. */
export const OneAtATime: Story = {
  render: () => (
    <div style={row}>
      <SharePopover />
      <Popover title="Filters" width="wide" trigger={<Button size="sm">Filters</Button>}>
        A wider popover, 360 px.
      </Popover>
    </div>
  ),
};

/** It closes when its trigger scrolls out of view. */
export const ClosesWhenTriggerLeaves: Story = {
  render: () => (
    <div style={{ height: '200px', overflow: 'auto', border: `${cssVar('border-width')} dashed ${cssVar('border-hairline')}` }}>
      <div style={{ padding: cssVar('sp-4') }}>
        <SharePopover />
      </div>
      <div style={{ height: '600px', padding: cssVar('sp-4') }}>
        <Caption>Open it, then scroll this box.</Caption>
      </div>
    </div>
  ),
};

/** Opened from a dark surface, the popover itself stays on the default surface. */
export const FromInverseSurface: Story = {
  render: () => (
    <Surface tone="inverse" style={{ padding: cssVar('sp-5'), borderRadius: cssVar('radius-md') }}>
      <SharePopover />
    </Surface>
  ),
};
