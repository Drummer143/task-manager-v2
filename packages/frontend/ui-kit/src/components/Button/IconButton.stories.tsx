import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton } from './IconButton';
import type { ButtonSize, ButtonVariant } from './types';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['md', 'sm'];

/*
 * Demo scaffolding only. The kit has no icon set yet — stroke glyphs stand in.
 * No size, color or stroke width here: Button's icon slot sets all three.
 */
const GLYPHS = {
  plus: 'M8 3v10M3 8h10',
  status: 'M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 2.5v11',
  link: 'M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1',
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3',
  trash: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.5 9h6l.5-9',
  collapse: 'M2.5 3h11v10h-11zM6 3v10M10.5 6.5L9 8l1.5 1.5',
} as const;

function Glyph({ name }: { name: keyof typeof GLYPHS }) {
  return (
    <svg viewBox="0 0 16 16" stroke="currentColor" fill="none">
      <path d={GLYPHS[name]} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content repeat(4, max-content)',
  gap: `${cssVar('sp-5')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
  fontSize: cssVar('type-meta'),
  color: cssVar('text-secondary'),
};

const toolbar: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: cssVar('sp-1'),
  padding: cssVar('sp-2'),
  border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  borderRadius: cssVar('radius-md'),
  background: cssVar('bg-raised'),
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

/** Variants × states, both sizes. Hover each one: its label is the tooltip. */
function StateGrid() {
  return (
    <>
      <span />
      {['default', 'disabled · reason', 'busy', 'menu open'].map((state) => (
        <Caption key={state}>{state}</Caption>
      ))}
      {SIZES.flatMap((size) =>
        VARIANTS.map((variant) => (
          <div key={`${variant}-${size}`} style={{ display: 'contents' }}>
            <Caption>
              {variant} · {size}
            </Caption>
            <IconButton variant={variant} size={size} icon={<Glyph name="plus" />} label="Add task" keys="c" />
            <IconButton
              variant={variant}
              size={size}
              icon={<Glyph name="archive" />}
              label="Archive"
              disabled
              disabledReason="Unavailable: no access to this board"
            />
            <IconButton variant={variant} size={size} icon={<Glyph name="link" />} label="Copy link" loading />
            <IconButton
              variant={variant}
              size={size}
              icon={<Glyph name="status" />}
              label="Status"
              aria-haspopup="menu"
              aria-expanded
            />
          </div>
        )),
      )}
    </>
  );
}

const meta: Meta<typeof IconButton> = {
  title: 'Primitives/IconButton',
  component: IconButton,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    size: { control: 'inline-radio', options: SIZES },
    label: { control: 'text', description: 'Required: the accessible name and the tooltip text.' },
    keys: { control: 'text', description: "Hotkey shown in the tooltip, e.g. 'c', 'mod+shift+c'." },
    tooltipPlacement: { control: 'inline-radio', options: ['top', 'bottom', 'left', 'right'] },
    disabled: { control: 'boolean' },
    disabledReason: { control: 'text' },
    loading: { control: 'boolean' },
    icon: { control: false },
    ref: { control: false },
  },
  args: {
    icon: <Glyph name="plus" />,
    label: 'Add task',
    keys: 'c',
    variant: 'ghost',
    size: 'md',
    disabled: false,
    loading: false,
  },
};

export default meta;
type Story = StoryObj<typeof IconButton>;

/** Playground. Hover or Tab onto it: the tooltip shows the label and the hotkey. */
export const Default: Story = {};

/** Every variant and state, both sizes — squares of the control height. */
export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StateGrid />
    </div>
  ),
};

/** On a dark surface the buttons recolor themselves; their tooltips turn light. */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StateGrid />
    </Surface>
  ),
};

/**
 * The main habitat: a toolbar of ghost icon buttons. After the first tooltip,
 * sliding along shows the next ones at once (the tooltip group).
 */
export const Toolbar: Story = {
  render: () => (
    <div style={toolbar} role="toolbar" aria-label="Task actions">
      <IconButton icon={<Glyph name="plus" />} label="Add task" keys="c" />
      <IconButton icon={<Glyph name="status" />} label="Status" keys="s" />
      <IconButton icon={<Glyph name="link" />} label="Copy link" keys="mod+shift+c" />
      <IconButton
        icon={<Glyph name="archive" />}
        label="Archive"
        disabled
        disabledReason="Unavailable: no access to this board"
      />
      <IconButton icon={<Glyph name="trash" />} label="Delete" variant="danger" />
    </div>
  ),
};

/** In a collapsed sidebar the tooltip goes to the right (spec example). */
export const CollapsedSidebar: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div
      style={{
        display: 'grid',
        alignContent: 'start',
        justifyItems: 'center',
        gap: cssVar('sp-2'),
        width: cssVar('sidebar-collapsed'),
        height: '100vh',
        paddingBlock: cssVar('sp-3'),
        borderRight: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
        background: cssVar('bg-raised'),
      }}
    >
      <IconButton icon={<Glyph name="collapse" />} label="Expand sidebar" keys="[" tooltipPlacement="right" />
      <IconButton icon={<Glyph name="plus" />} label="New page" tooltipPlacement="right" />
      <IconButton icon={<Glyph name="status" />} label="Inbox" keys="g i" tooltipPlacement="right" />
    </div>
  ),
};

/** Busy: an icon-sized spinner replaces the icon after 200 ms; the square does not change size. */
export const Busy: Story = {
  render: (args) => {
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'center' }}>
        <IconButton
          {...args}
          icon={<Glyph name="link" />}
          label="Copy link"
          keys="mod+shift+c"
          loading={loading}
          onClick={() => {
            setLoading(true);
            timer.current = setTimeout(() => setLoading(false), 1500);
          }}
        />
        <Caption>Click: busy for 1.5 s. The square keeps its size.</Caption>
      </div>
    );
  },
};

/** Height follows the density and the square follows the height. */
export const Densities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ ...stand, gridTemplateColumns: 'max-content 1fr' }}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'contents' }}>
          <Caption>{density}</Caption>
          <div style={toolbar}>
            {SIZES.map((size) => (
              <IconButton key={size} size={size} icon={<Glyph name="plus" />} label={`Add task · ${size}`} />
            ))}
            <IconButton icon={<Glyph name="status" />} label="Status" variant="secondary" />
          </div>
        </div>
      ))}
    </div>
  ),
};
