import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties, ReactNode } from 'react';
import { Surface, useSurface } from './Surface';
import { Kbd } from '../Kbd';
import { cssVar } from '../../tokens';

/**
 * Demo scaffolding only. SelectionBar and Menu do not exist yet — these mocks
 * read semantic tokens exactly like kit components will, so they show how a
 * surface recolors everything inside without a single prop.
 */
const hairline = `${cssVar('border-width')} solid ${cssVar('border-hairline')}`;

const caption: CSSProperties = { fontSize: cssVar('type-meta'), color: cssVar('text-muted') };

function MockButton({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: cssVar('sp-3'),
        height: cssVar('control-height-sm'),
        padding: `0 ${cssVar('sp-3')}`,
        border: hairline,
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

function ToneBadge() {
  return <span style={caption}>useSurface() → {useSurface()}</span>;
}

function MockMenu() {
  return (
    <Surface
      tone="default"
      style={{
        display: 'grid',
        width: cssVar('column-width'),
        padding: cssVar('sp-2'),
        border: hairline,
        borderRadius: cssVar('radius-sm'),
        background: cssVar('bg-raised'),
        boxShadow: cssVar('shadow-overlay'),
        fontSize: cssVar('type-body'),
      }}
    >
      {['In progress', 'Review', 'Done'].map((status) => (
        <span
          key={status}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: cssVar('row-height'),
            padding: `0 ${cssVar('sp-3')}`,
          }}
        >
          {status}
          <span style={{ color: cssVar('text-muted') }}>{status[0]}</span>
        </span>
      ))}
      <ToneBadge />
    </Surface>
  );
}

function MockSelectionBar({ children }: { children?: ReactNode }) {
  return (
    <Surface
      tone="inverse"
      role="toolbar"
      aria-label="Selection"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: cssVar('sp-3'),
        height: cssVar('hit-min'),
        padding: `0 ${cssVar('sp-3')}`,
        borderRadius: cssVar('radius-md'),
        boxShadow: cssVar('shadow-overlay'),
        fontSize: cssVar('type-body'),
      }}
    >
      <span style={{ fontVariantNumeric: cssVar('num-tabular') }}>Selected: 2</span>
      <MockButton>
        Status <Kbd keys="s" variant="inline" />
      </MockButton>
      <MockButton>
        More <Kbd keys="mod+k" />
      </MockButton>
      <ToneBadge />
      {children}
    </Surface>
  );
}

const meta: Meta<typeof Surface> = {
  title: 'Primitives/Surface',
  component: Surface,
  parameters: { layout: 'fullscreen' },
  args: { tone: 'inverse' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['default', 'inverse'] },
    asChild: { control: false },
  },
};

export default meta;
type Story = StoryObj<typeof Surface>;

/** Playground: switch the tone — the content inside recolors itself. */
export const Default: Story = {
  render: (args) => (
    <div style={{ padding: cssVar('sp-6') }}>
      <Surface
        {...args}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: cssVar('sp-4'),
          padding: cssVar('sp-5'),
          border: hairline,
          borderRadius: cssVar('radius-md'),
        }}
      >
        <span>Text primary</span>
        <span style={{ color: cssVar('text-secondary') }}>secondary</span>
        <span style={{ color: cssVar('text-muted') }}>muted</span>
        <span style={{ color: cssVar('text-accent') }}>accent</span>
        <MockButton>
          Undo <Kbd keys="mod+z" variant="inline" />
        </MockButton>
        <Kbd keys="g b" />
        <ToneBadge />
      </Surface>
    </div>
  ),
};

/**
 * The design's nesting example. Canvas — default (sets nothing). SelectionBar —
 * inverse. The status menu opened from it — default again: overlays look the
 * same wherever they are opened from.
 */
export const Nesting: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-5'), padding: cssVar('sp-6') }}>
      <span style={caption}>default · canvas</span>
      <div style={{ display: 'flex', gap: cssVar('sp-4') }}>
        {['Move tokens to a package', 'Hotkey registry'].map((title) => (
          <div
            key={title}
            style={{
              width: cssVar('column-width'),
              padding: cssVar('card-padding'),
              border: hairline,
              borderRadius: cssVar('radius-sm'),
              background: cssVar('bg-raised'),
              boxShadow: `inset 0 0 0 ${cssVar('border-width')} ${cssVar('border-accent')}`,
            }}
          >
            {title}
          </div>
        ))}
      </div>

      <span style={caption}>inverse · SelectionBar → default · menu</span>
      <div style={{ display: 'grid', gap: cssVar('sp-3'), justifyItems: 'start' }}>
        <MockSelectionBar />
        <MockMenu />
      </div>
    </div>
  ),
};

/** `asChild` puts the surface on the child element — no extra wrapper in the DOM. */
export const AsChild: Story = {
  render: () => (
    <div style={{ padding: cssVar('sp-6') }}>
      <Surface tone="inverse" asChild>
        <section style={{ display: 'inline-flex', gap: cssVar('sp-3'), padding: cssVar('sp-4'), borderRadius: cssVar('radius-md') }}>
          &lt;section data-surface="inverse"&gt; <Kbd keys="esc" />
        </section>
      </Surface>
    </div>
  ),
};
