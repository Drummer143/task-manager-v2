import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { Link, type LinkVariant } from './Link';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const meta: Meta<typeof Link> = {
  title: 'Navigation/Link',
  component: Link,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: { control: 'select', options: ['inline', 'standalone', 'subtle'] },
    href: { control: 'text' },
    target: { control: 'select', options: [undefined, '_self', '_blank'] },
  },
};

export default meta;

type Story = StoryObj<typeof Link>;

export const Default: Story = {
  args: {
    children: 'release notes',
    href: '/w/product/p/notes',
    variant: 'inline',
  },
};

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content max-content',
  gap: `${cssVar('sp-4')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

const caption: CSSProperties = { fontSize: cssVar('type-meta'), color: cssVar('text-muted') };

const ROWS: Array<{ name: string; variant: LinkVariant; href: string; text: string }> = [
  { name: 'inline', variant: 'inline', href: '/w/product/p/notes', text: 'release notes' },
  { name: 'standalone', variant: 'standalone', href: '/w/product/p/tasks', text: 'View all tasks' },
  { name: 'subtle', variant: 'subtle', href: '/w/product/p/history', text: 'edited 14:32' },
  { name: 'external', variant: 'inline', href: 'https://tiptap.dev', text: 'tiptap.dev' },
  { name: 'current', variant: 'subtle', href: '/w/product/p/board-q3', text: 'Q3 board' },
];

const MatrixDemo: React.FC = () => (
  <div style={grid}>
    {ROWS.map((row) => (
      <div key={row.name} style={{ display: 'contents' }}>
        <span style={caption}>{row.name}</span>
        <Link href={row.href} variant={row.variant} current={row.name === 'current'}>
          {row.text}
        </Link>
      </div>
    ))}
  </div>
);

export const Kinds: Story = { render: () => <MatrixDemo />, parameters: { layout: 'padded' } };

export const Inverse: Story = {
  render: () => (
    <Surface tone="inverse" style={{ borderRadius: cssVar('radius-md') }}>
      <MatrixDemo />
    </Surface>
  ),
  parameters: { layout: 'padded' },
};

const box: CSSProperties = {
  maxWidth: 320,
  padding: `${cssVar('sp-4')} ${cssVar('sp-5')}`,
  border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  borderRadius: cssVar('radius-sm'),
  background: cssVar('bg-raised'),
};

const InContextDemo: React.FC = () => (
  <div style={{ display: 'grid', gap: cssVar('sp-5'), padding: cssVar('sp-6') }}>
    <div style={box}>
      Follow the <Link href="/w/kit/p/tokens">token rules</Link> from the kit and check the{' '}
      <Link href="https://tiptap.dev/docs">Tiptap docs</Link> for node views.
    </div>
    <div style={{ ...box, ...caption, display: 'flex', gap: cssVar('sp-3'), flexWrap: 'wrap' }}>
      <Link variant="subtle" href="/w/product/p/board-q3?task=TM-248">
        TM-248
      </Link>
      <span>·</span>
      <span>
        created by{' '}
        <Link variant="subtle" href="/people/anna">
          Anna Kim
        </Link>
      </span>
      <span>·</span>
      <Link variant="subtle" href="/w/product/p/board-q3?task=TM-248&history=1">
        edited 14:32
      </Link>
    </div>
    <nav aria-label="Breadcrumbs" style={{ ...box, ...caption, display: 'flex', gap: cssVar('sp-3') }}>
      <Link variant="subtle" href="/w/product">
        Product
      </Link>
      <span>/</span>
      <Link variant="subtle" href="/w/product/p/web">
        Web
      </Link>
      <span>/</span>
      <Link variant="subtle" href="/w/product/p/board-q3" current>
        Q3 board
      </Link>
    </nav>
    <div
      data-tone="danger"
      style={{ ...box, background: cssVar('bg-danger-soft'), color: cssVar('text-danger'), borderColor: 'transparent' }}
    >
      You don’t have access to this board. <Link href="/w/product/access">Ask for access</Link>
    </div>
    <div style={box}>
      A long URL breaks anywhere:{' '}
      <Link href="https://github.com/Drummer143/task-manager/tree/main/libs/frontend/ui-kit/src/components">
        https://github.com/Drummer143/task-manager/tree/main/libs/frontend/ui-kit/src/components
      </Link>
    </div>
  </div>
);

export const InContext: Story = { render: () => <InContextDemo />, parameters: { layout: 'padded' } };
