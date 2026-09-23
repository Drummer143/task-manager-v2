import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { Kbd } from './Kbd';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

/**
 * Demo scaffolding only — lays the variants out like the design stand.
 * Button / MenuItem do not exist yet, so their inline hotkeys are mocked with
 * plain spans to show where `inline` lives.
 */
const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
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
  gap: `${cssVar('sp-4')} ${cssVar('sp-5')}`,
};

function Label({ children }: { children: ReactNode }) {
  return (
    <span
      style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}
    >
      {children}
    </span>
  );
}

function MockButton({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: cssVar('sp-3'),
        height: cssVar('control-height-sm'),
        padding: `0 ${cssVar('sp-3')}`,
        border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
        borderRadius: cssVar('radius-sm'),
        background: cssVar('bg-raised'),
        color: cssVar('text-primary'),
        fontSize: cssVar('type-meta'),
      }}
    >
      {children}
    </span>
  );
}

function Separator() {
  return (
    <span
      style={{
        alignSelf: 'stretch',
        width: cssVar('border-width'),
        background: cssVar('border-hairline'),
      }}
    />
  );
}

const SAMPLES = ['c', 'mod+k', 'g b', 'mod+shift+c', 'g t', 'mod+k s', 'esc'];

/** The design's key / inline rows. Reads semantics only, so it works on any surface. */
function VariantRows({ actions }: { actions: ReactNode }) {
  return (
    <>
      <Label>kbd · key</Label>
      <div style={row}>
        {SAMPLES.map((keys) => (
          <Kbd key={keys} keys={keys} />
        ))}
      </div>

      <Label>kbd · inline</Label>
      <div style={row}>
        {SAMPLES.map((keys) => (
          <Kbd key={keys} keys={keys} variant="inline" />
        ))}
        <Separator />
        {actions}
      </div>
    </>
  );
}

const meta: Meta<typeof Kbd> = {
  title: 'Primitives/Kbd',
  component: Kbd,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Kbd>;

export const Default: Story = {
  argTypes: {
    keys: {
      control: 'text',
      description:
        "Key notation: `+` joins keys pressed together, a space separates steps. `mod` is ⌘ on Apple, Ctrl elsewhere. Examples: 's', 'mod+k', 'mod+shift+c', 'g b'.",
    },
    variant: {
      control: 'inline-radio',
      options: ['key', 'inline'],
      description:
        '`key` — keycaps with a border; `inline` — muted text inside a button, menu item or field.',
    },
  },
  args: {
    keys: 'mod+k',
    variant: 'key',
  },
};

export const NamedKeys: Story = {
  render: (props) => (
    <div style={row}>
      {[
        'esc',
        'enter',
        'space',
        'tab',
        'backspace',
        'up',
        'down',
        'left',
        'right',
        'home',
        'end',
        'f2',
        '/',
        '?',
      ].map((keys) => (
        <Kbd key={keys} {...props} keys={keys} />
      ))}
    </div>
  ),
};

/**
 * On a dark surface: transparent keycaps with a light border, lighter text.
 * No prop — Kbd reads semantic tokens and the inverse surface swaps them.
 */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <VariantRows
        actions={
          <>
            <MockButton>
              Undo <Kbd keys="mod+z" variant="inline" />
            </MockButton>
            <MockButton>
              Status <Kbd keys="s" variant="inline" />
            </MockButton>
            <MockButton>
              Clear <Kbd keys="esc" variant="inline" />
            </MockButton>
          </>
        }
      />

      <Label>in prose</Label>
      <p style={{ margin: 0, fontSize: cssVar('type-body') }}>
        More actions <Kbd keys="mod+k" />
      </p>
    </Surface>
  ),
};
