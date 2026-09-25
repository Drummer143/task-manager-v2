import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import type { ButtonSize, ButtonVariant } from './types';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES: ButtonSize[] = ['md', 'sm'];

/* Demo scaffolding only. The kit has no icon set yet — a stroke glyph stands in. */
function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      style={{
        width: cssVar('icon-size'),
        height: cssVar('icon-size'),
        stroke: 'currentColor',
        fill: 'none',
      }}
    >
      {/* viewBox units: 1.5 of 16 at the 16 px icon size. */}
      <path d="M8 3v10M3 8h10" strokeWidth={1.5} strokeLinecap="round" />
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

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: cssVar('sp-3'),
};

function Caption({ children }: { children: ReactNode }) {
  return (
    <span
      style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}
    >
      {children}
    </span>
  );
}

/** Variants × states, as the design's first stand. Hover and pressed are live — try them. */
function StateGrid({ size }: { size: ButtonSize }) {
  return (
    <>
      <span />
      {['default', 'with icon', 'disabled', 'busy'].map((state) => (
        <Caption key={state}>{state}</Caption>
      ))}
      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: 'contents' }}>
          <Caption>
            {variant} · {size}
          </Caption>
          <Button variant={variant} size={size} keys="c">
            Create task
          </Button>
          <Button variant={variant} size={size} icon={<PlusIcon />}>
            Create task
          </Button>
          <Button
            variant={variant}
            size={size}
            disabled
            disabledReason="Unavailable: no access to this board"
          >
            Create task
          </Button>
          <Button variant={variant} size={size} icon={<PlusIcon />} loading>
            Create task
          </Button>
        </div>
      ))}
    </>
  );
}

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    size: { control: 'inline-radio', options: SIZES },
    keys: {
      control: 'text',
      description: "Kbd notation shown after the label, e.g. 'c', 'mod+k'.",
    },
    disabled: { control: 'boolean' },
    disabledReason: {
      control: 'text',
      description: 'Shown in a tooltip while disabled.',
    },
    loading: { control: 'boolean' },
    href: {
      control: 'text',
      description: 'Renders a link that looks like a button.',
    },
    icon: { control: false },
    ref: { control: false },
  },
  args: {
    variant: 'primary',
    size: 'md',
    children: 'Create task',
    keys: 'c',
    loading: false,
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

/** Playground: every prop in the controls. */
export const Default: Story = {};

/** All variants in all states, both sizes. The disabled column shows its reason on hover or Tab. */
export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StateGrid size="md" />
      <StateGrid size="sm" />
    </div>
  ),
};

/**
 * On a dark surface (undo bar, selection bar): the accent takes its light step,
 * secondary gets a 6% light base, hover and pressed tint lighter. No prop.
 */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StateGrid size="md" />
      <StateGrid size="sm" />
    </Surface>
  ),
};

/**
 * Busy with real timings: the press is ignored at once, the spinner appears only
 * after 200 ms and stays at least 400 ms. Fast never shows a spinner at all.
 */
export const Busy: Story = {
  render: (args) => {
    const [busy, setBusy] = useState<string | null>(null);
    const [presses, setPresses] = useState(0);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const run = (name: string, ms: number) => {
      setPresses((count) => count + 1);
      setBusy(name);
      timer.current = setTimeout(() => setBusy(null), ms);
    };

    return (
      <div
        style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}
      >
        <div style={row}>
          <Button
            {...args}
            icon={<PlusIcon />}
            loading={busy === 'fast'}
            onClick={() => run('fast', 120)}
          >
            Fast · 120 ms
          </Button>
          <Button
            {...args}
            icon={<PlusIcon />}
            loading={busy === 'slow'}
            onClick={() => run('slow', 1500)}
          >
            Slow · 1.5 s
          </Button>
          <Button
            {...args}
            loading={busy === 'plain'}
            onClick={() => run('plain', 1500)}
          >
            No icon · 1.5 s
          </Button>
        </div>
        <Caption>
          Presses that reached the handler: {presses}. Click a busy button again
          — the count does not change.
        </Caption>
      </div>
    );
  },
  args: { keys: undefined },
};

/** A link that looks like a button stays a link: middle-click and "open in new tab" work. */
export const AsLink: Story = {
  render: (args) => (
    <div style={row}>
      <Button {...args} href="#board">
        Open board
      </Button>
      <Button
        {...args}
        variant="secondary"
        href="#export"
        download="export.csv"
      >
        Export CSV
      </Button>
      <Button
        {...args}
        variant="secondary"
        href="#board"
        disabled
        disabledReason="Unavailable: board is archived"
      >
        Disabled link
      </Button>
    </div>
  ),
  args: { keys: undefined },
};

/** A menu trigger keeps the pressed look while its menu is open (aria-expanded="true"). */
export const MenuTrigger: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div
        style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}
      >
        <div style={row}>
          {VARIANTS.map((variant) => (
            <Button
              key={variant}
              variant={variant}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              Actions ▾
            </Button>
          ))}
        </div>
        <Caption>
          Menu {open ? 'open — every trigger holds the pressed look' : 'closed'}
          . Click any trigger to toggle.
        </Caption>
      </div>
    );
  },
};

/** Keyboard: the ring shows on Tab only, never on a mouse click (spec). */
export const Keyboard: Story = {
  render: () => (
    <div
      style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start' }}
    >
      <Caption>
        Click the buttons: no ring. Tab through them: the ring appears, the
        disabled one is reachable for its reason.
      </Caption>
      <div style={row}>
        <Button keys="c">Create task</Button>
        <Button variant="secondary" keys="s">
          Status
        </Button>
        <Button
          variant="ghost"
          disabled
          disabledReason="Unavailable: no access to this board"
        >
          Archive
        </Button>
        <Button variant="danger">Delete</Button>
      </div>
    </div>
  ),
};

/** Height and padding follow the density; the label size does not (spec 08). */
export const Densities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ ...stand, gridTemplateColumns: 'max-content 1fr' }}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div
          key={density}
          data-density={density}
          style={{ display: 'contents' }}
        >
          <Caption>{density}</Caption>
          <div style={row}>
            {SIZES.map((size) => (
              <Button key={size} size={size} icon={<PlusIcon />} keys="c">
                Create task
              </Button>
            ))}
            <Button variant="secondary" keys="s">
              Status
            </Button>
          </div>
        </div>
      ))}
    </div>
  ),
};
