import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode } from 'react';
import { Avatar } from './Avatar';
import { AvatarStack } from './AvatarStack';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

/* Demo people — invented names. */
const PEOPLE = [
  { id: 'u-anna', name: 'Anna Kim' },
  { id: 'u-ivan', name: 'Ivan Petrov' },
  { id: 'u-maria', name: 'Maria Sokolova' },
  { id: 'u-oleg', name: 'Oleg Ivanov' },
  { id: 'u-pavel', name: 'Pavel Orlov' },
  { id: 'u-sofia', name: 'Sofia Lebedeva' },
  { id: 'u-timur', name: 'Timur Akhmetov' },
];

/* A generated "photo": no network, no real face. */
const PHOTO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="#c28d41"/><stop offset="1" stop-color="#4f6d8a"/></linearGradient></defs><rect width="40" height="40" fill="url(#g)"/><circle cx="20" cy="16" r="7" fill="#f3f2f2"/><rect x="8" y="26" width="24" height="16" rx="8" fill="#f3f2f2"/></svg>',
)}`;

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: `${cssVar('sp-4')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

const row: CSSProperties = { display: 'flex', gap: cssVar('sp-3'), alignItems: 'center' };

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

function Stand() {
  return (
    <>
      <Caption>xs · sm · md</Caption>
      <div style={row}>
        <Avatar size="xs" name="Anna Kim" id="u-anna" />
        <Avatar size="sm" name="Anna Kim" id="u-anna" />
        <Avatar size="md" name="Anna Kim" id="u-anna" />
      </div>
      <Caption>tone by id</Caption>
      <div style={row}>
        {PEOPLE.map((person) => (
          <Avatar key={person.id} {...person} />
        ))}
      </div>
      <Caption>photo</Caption>
      <div style={row}>
        <Avatar size="sm" name="Anna Kim" src={PHOTO} />
        <Avatar size="md" name="Anna Kim" src={PHOTO} />
        <Avatar size="md" name="Ivan Petrov" id="u-ivan" src="/missing-photo.png" />
        <Caption>a broken photo keeps the initials</Caption>
      </div>
      <Caption>nobody · assign</Caption>
      <div style={row}>
        <Avatar size="sm" />
        <Avatar size="md" onClick={() => undefined} />
      </div>
      <Caption>stack · max 3</Caption>
      <div style={row}>
        <AvatarStack people={PEOPLE} aria-label="Watching" />
        <AvatarStack people={PEOPLE.slice(0, 2)} size="md" aria-label="Editing" />
      </div>
    </>
  );
}

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
  component: Avatar,
  parameters: { layout: 'fullscreen' },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

/** Initials on a neutral tone picked by a hash of the id: the same person is the same color everywhere. */
export const Gallery: Story = {
  render: () => (
    <div style={stand}>
      <Stand />
    </div>
  ),
};

/** On a dark surface: darker tones, light initials; the stack ring is the surface color, not white. */
export const OnInverseSurface: Story = {
  render: () => (
    <Surface tone="inverse" style={stand}>
      <Stand />
    </Surface>
  ),
};
