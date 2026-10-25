import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties } from 'react';
import { Heading } from './Heading';
import { Text, type TextSize, type TextTone } from './Text';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content minmax(0, 1fr)',
  gap: `${cssVar('sp-4')} ${cssVar('sp-6')}`,
  alignItems: 'baseline',
  padding: cssVar('sp-6'),
};

const STEPS: { size: TextSize; sample: string }[] = [
  { size: 'display', sample: 'Q3 release notes' },
  { size: 'h1', sample: 'AppShell: shell hotkeys and resize' },
  { size: 'h2', sample: 'Description' },
  { size: 'h3', sample: 'In progress · 4' },
  { size: 'body', sample: 'Tasks move between statuses with keyboard shortcuts.' },
  { size: 'meta', sample: 'Anna Kim · edited 14:32 · TM-248' },
];

const TONES: { tone: TextTone; sample: string }[] = [
  { tone: 'primary', sample: 'Move task to Review' },
  { tone: 'secondary', sample: 'Secondary field value' },
  { tone: 'muted', sample: 'edited 14:32 · 3 comments' },
  { tone: 'accent', sample: 'Link, today, create “perf”' },
  { tone: 'danger', sample: 'Not saved · overdue' },
];

function Scale() {
  return (
    <>
      {STEPS.map(({ size, sample }) => (
        <div key={size} style={{ display: 'contents' }}>
          <Text size="meta" tone="muted" mono>
            {size}
          </Text>
          <Text size={size}>{sample}</Text>
        </div>
      ))}
      {TONES.map(({ tone, sample }) => (
        <div key={tone} style={{ display: 'contents' }}>
          <Text size="meta" tone="muted" mono>
            {tone}
          </Text>
          <Text tone={tone}>{sample}</Text>
        </div>
      ))}
    </>
  );
}

const meta: Meta<typeof Text> = {
  title: 'Primitives/Text',
  component: Text,
};

export default meta;

type Story = StoryObj<typeof Text>;

/** The six steps and the text roles (spec: Typography 02, 04). */
export const ScaleAndTones: Story = {
  render: () => (
    <div style={stand}>
      <Scale />
    </div>
  ),
};

/** The same roles on a dark surface: they follow it, a shade would not. */
export const OnInverseSurface: Story = {
  render: () => (
    <Surface tone="inverse" style={stand}>
      <Scale />
    </Surface>
  ),
};

/** A heading's level is its size and its tag (Typography 08). */
export const Headings: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-3'), padding: cssVar('sp-6') }}>
      <Heading level="display">Q3 release notes</Heading>
      <Heading level={1}>AppShell: shell hotkeys and resize</Heading>
      <Heading level={2}>Description</Heading>
      <Heading level={3}>In progress · 4</Heading>
    </div>
  ),
};

/** Tabular digits in data, proportional in prose (Typography 05). */
export const Numbers: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-4'), padding: cssVar('sp-6'), maxWidth: 360 }}>
      <div style={{ display: 'grid' }}>
        <Text numeric>In progress · 11</Text>
        <Text numeric>Review · 4</Text>
        <Text numeric>Done · 118</Text>
        <Text size="meta" tone="muted" numeric>
          14:32 · 09:05 · 21:41
        </Text>
      </div>
      <Text as="p">We moved 118 tasks in 11 days — 4 are still in review.</Text>
      <Text size="meta" tone="muted" mono>
        TM-248
      </Text>
    </div>
  ),
};

/** One line or N lines; hover a cut one to read it whole. Messages are never truncated. */
export const Truncation: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-5'), padding: cssVar('sp-6'), width: 240 }}>
      <Text truncate>Move the token layer into a separate package</Text>
      <Text truncate={2}>Move the token layer into a separate package and load it first in every app</Text>
      <Text truncate>Fits on one line</Text>
      <Text as="p" tone="danger">
        Only project admins can block tasks. Ask Anna Kim.
      </Text>
    </div>
  ),
};
