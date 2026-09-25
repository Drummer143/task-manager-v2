import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useState } from 'react';
import { Tag } from './Tag';
import { TagList } from './TagList';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

/* Board status colors as they come from data — deliberately raw and uneven. */
const STATUSES = [
  { name: 'Backlog', color: '#8b8b8b' },
  { name: 'In progress', color: '#3b82f6' },
  { name: 'Review', color: '#a855f7' },
  { name: 'Done', color: '#22c55e' },
  { name: 'Blocked', color: '#ef4444' },
];

/* User labels, also from data. */
const LABELS = [
  { name: 'urgent', color: '#e11d48' },
  { name: 'design', color: '#f59e0b' },
  { name: 'backend', color: '#0ea5e9' },
  { name: 'research', color: '#10b981' },
];

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: `${cssVar('sp-4')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: cssVar('sp-2'), alignItems: 'center' };

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

function RemovableTags() {
  const [tags, setTags] = useState(['kit', 'tokens', 'docs']);

  return (
    <div style={row}>
      {tags.map((tag) => (
        <Tag key={tag} onRemove={() => setTags((current) => current.filter((item) => item !== tag))}>
          {tag}
        </Tag>
      ))}
      {tags.length === 0 && <Caption>All removed — reload the story</Caption>}
    </div>
  );
}

function Stand() {
  return (
    <>
      <Caption>tones</Caption>
      <div style={row}>
        <Tag>infra</Tag>
        <Tag tone="accent">kit</Tag>
        <Tag tone="outline">data</Tag>
        <Tag tone="danger">Overdue</Tag>
      </div>
      <Caption>status · from data</Caption>
      <div style={row}>
        {STATUSES.map((status) => (
          <Tag key={status.name} dot color={status.color}>
            {status.name}
          </Tag>
        ))}
      </div>
      <Caption>label · from data</Caption>
      <div style={row}>
        {LABELS.map((label) => (
          <Tag key={label.name} color={label.color}>
            {label.name}
          </Tag>
        ))}
      </div>
      <Caption>clickable</Caption>
      <div style={row}>
        <Tag onClick={() => undefined}>infra</Tag>
        <Tag tone="accent" onClick={() => undefined}>
          kit
        </Tag>
        <Tag dot color="#3b82f6" onClick={() => undefined}>
          In progress
        </Tag>
      </div>
      <Caption>removable</Caption>
      <RemovableTags />
      <Caption>on a card · max 3</Caption>
      <TagList tags={[...LABELS, { name: 'docs' }].map((label, id) => ({ id, label: label.name, color: 'color' in label ? label.color : undefined }))} />
    </>
  );
}

const meta: Meta<typeof Tag> = {
  title: 'Primitives/Tag',
  component: Tag,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Tag>;

/**
 * Colors from data never go on screen as they are: tint() keeps the hue and
 * takes the lightness of the kit's ramp — step 500 for a dot, 100 for a fill,
 * 700 for the text. The raw colors above are deliberately uneven; the tags are not.
 */
export const Gallery: Story = {
  render: () => (
    <div style={stand}>
      <Stand />
    </div>
  ),
};

/** On a dark surface: translucent light fills, text of step 300; data colors go to step 300 / 16%. */
export const OnInverseSurface: Story = {
  render: () => (
    <Surface tone="inverse" style={stand}>
      <Stand />
    </Surface>
  ),
};
