import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useState } from 'react';
import { Segmented, type SegmentedOption } from './Segmented';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

/* Demo scaffolding only: stand-in glyphs until the kit has its icon set. */
function BoardIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="2" y="2.5" width="3.5" height="11" rx="1" />
      <rect x="6.25" y="2.5" width="3.5" height="7" rx="1" />
      <rect x="10.5" y="2.5" width="3.5" height="9" rx="1" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
    </svg>
  );
}

type View = 'board' | 'table' | 'calendar';
type Period = 'week' | 'month' | 'quarter';
type Density = 'compact' | 'default' | 'comfortable';

const VIEWS: SegmentedOption<View>[] = [
  { value: 'board', label: 'Board', keys: 'g b' },
  { value: 'table', label: 'Table', keys: 'g t' },
];

const VIEWS_WITH_CALENDAR: SegmentedOption<View>[] = [
  { value: 'board', label: 'Board' },
  { value: 'table', label: 'Table' },
  { value: 'calendar', label: 'Calendar', disabledReason: 'Needs due dates on the board' },
];

const PERIODS: SegmentedOption<Period>[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
];

const ICON_VIEWS: SegmentedOption<View>[] = [
  { value: 'board', label: 'Board', icon: <BoardIcon />, iconOnly: true, keys: 'g b' },
  { value: 'table', label: 'Table', icon: <TableIcon />, iconOnly: true, keys: 'g t' },
];

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content max-content',
  gap: `${cssVar('sp-5')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

function Owned<T extends string>({
  options,
  initial,
  label = 'View',
  ...props
}: { options: SegmentedOption<T>[]; initial: T; size?: 'md' | 'sm'; disabled?: boolean; disabledReason?: string; label?: string }) {
  const [value, setValue] = useState<T>(initial);

  return <Segmented<T> aria-label={label} {...props} options={options} value={value} onValueChange={setValue} />;
}

/** Every state; hover and press are live. Tab onto a group — the ring is on the whole group. */
function StateGrid() {
  return (
    <>
      <Caption>md · hotkeys</Caption>
      <Owned options={VIEWS} initial="board" />
      <Caption>sm · period</Caption>
      <Owned options={PERIODS} initial="month" size="sm" label="Period" />
      <Caption>segment unavailable</Caption>
      <Owned options={VIEWS_WITH_CALENDAR} initial="board" />
      <Caption>group unavailable</Caption>
      <Owned options={VIEWS} initial="table" disabled disabledReason="Views are locked on this board" />
      <Caption>icons only</Caption>
      <Owned options={ICON_VIEWS} initial="board" />
      <Caption>icons only · sm</Caption>
      <Owned options={ICON_VIEWS} initial="table" size="sm" />
    </>
  );
}

const meta: Meta<typeof Segmented> = {
  title: 'Primitives/Segmented',
  component: Segmented,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Segmented>;

export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StateGrid />
    </div>
  ),
};

/**
 * Keyboard: Tab into the group, ←/→ choose and apply at once, the unavailable
 * one is skipped. The choice here drives the density of the preview below.
 */
export const Live: Story = {
  render: () => {
    const [density, setDensity] = useState<Density>('default');

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-5'), justifyItems: 'start' }}>
        <Segmented<Density>
          aria-label="Density"
          size="sm"
          value={density}
          onValueChange={setDensity}
          options={[
            { value: 'compact', label: 'Compact' },
            { value: 'default', label: 'Default' },
            { value: 'comfortable', label: 'Comfortable', disabledReason: 'Only for documents' },
          ]}
        />
        <div data-density={density} style={{ display: 'grid', gap: cssVar('sp-3') }}>
          <Owned options={VIEWS} initial="board" />
          <Caption>The view switcher follows the density: {density}.</Caption>
        </div>
      </div>
    );
  },
};

/** On a dark surface: 6% light base, light dividers, accent-400 outline and accent-300 text. */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StateGrid />
    </Surface>
  ),
};

/** md follows --segmented-height, sm --control-height-sm; the text size stays. */
export const Densities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ ...stand, gridTemplateColumns: 'max-content max-content max-content' }}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'contents' }}>
          <Caption>{density}</Caption>
          <Owned options={VIEWS} initial="board" />
          <Owned options={PERIODS} initial="week" size="sm" label="Period" />
        </div>
      ))}
    </div>
  ),
};
