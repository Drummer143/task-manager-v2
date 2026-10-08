import type { Meta, StoryObj } from '@storybook/react-vite';
import type { CSSProperties } from 'react';
import { Avatar, Surface, cssVar } from '@task-manager-v2/ui-kit';
import { ArchiveIcon, MarkReadIcon, MarkUnreadIcon } from '@task-manager-v2/ui-kit/icons';
import { NotificationRow, type NotificationAction, type NotificationRowProps } from './NotificationRow';

const meta: Meta<typeof NotificationRow> = {
  title: 'Shared/NotificationRow',
  component: NotificationRow,
  parameters: { layout: 'fullscreen' },
};

export default meta;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

const key: CSSProperties = { fontFamily: cssVar('font-mono') };
const quote: CSSProperties = { color: cssVar('text-secondary') };

/** What the Inbox screen will build from a notification: line 2 is the key and a title or a quote. */
const Where: React.FC<{ taskKey: string; text: string; isQuote?: boolean }> = ({ taskKey, text, isQuote }) => (
  <>
    <span style={key}>{taskKey}</span> {isQuote ? <span style={quote}>“{text}”</span> : text}
  </>
);

const actionsFor = (unread: boolean): NotificationAction[] => [
  unread
    ? { icon: <MarkReadIcon />, label: 'Mark as read', keys: 'u', onClick: () => undefined }
    : { icon: <MarkUnreadIcon />, label: 'Mark as unread', keys: 'u', onClick: () => undefined },
  { icon: <ArchiveIcon />, label: 'Archive', keys: 'e', onClick: () => undefined },
];

const row = (props: Partial<NotificationRowProps> & { id: string }): NotificationRowProps => ({
  href: `/inbox?view=unread&task=${props.id}`,
  unread: true,
  avatar: <Avatar name="Mira Sato" id="u2" size="sm" />,
  title: 'Mira Sato mentioned you',
  context: <Where taskKey="TM-248" text="Can we reuse the undo toast here?" isQuote />,
  time: minutesAgo(2),
  actions: actionsFor(props.unread ?? true),
  ...props,
});

const ROWS: Array<{ name: string; props: NotificationRowProps }> = [
  { name: 'Unread', props: row({ id: 'n1' }) },
  { name: 'Read', props: row({ id: 'n2', unread: false }) },
  { name: 'Cursor', props: row({ id: 'n3', cursor: true }) },
  { name: 'Opened in the panel', props: row({ id: 'n4', opened: true, unread: false }) },
  { name: 'Opened + cursor', props: row({ id: 'n5', opened: true, cursor: true, unread: false }) },
  {
    name: 'Folded · 5 events',
    props: row({
      id: 'n6',
      avatar: <Avatar name="Dan Kerr" id="u3" size="sm" />,
      title: 'Dan Kerr and 2 others commented',
      context: <Where taskKey="TM-243" text="Moved it to the shared queue." isQuote />,
      count: 5,
      time: minutesAgo(14),
    }),
  },
  {
    name: 'Object deleted',
    props: row({
      id: 'n7',
      unread: false,
      avatar: <Avatar name="Alex Kim" id="u1" size="sm" />,
      title: 'Alex Kim assigned you · task deleted',
      context: <Where taskKey="TM-231" text="Old onboarding flow" />,
      gone: true,
      time: new Date(Date.now() - 20 * 24 * 3_600_000),
    }),
  },
  {
    name: 'Long text',
    props: row({
      id: 'n8',
      title: 'Mira Sato mentioned you in Quarterly planning notes and decisions for the next year',
      context: <Where taskKey="TM-250" text="This is a long comment that keeps going well past the width of the list" isQuote />,
      time: new Date(Date.now() - 26 * 3_600_000),
    }),
  },
];

/** The rows in a grid, as the Inbox list will hold them; the label on the left is only the story's. */
const List: React.FC<{ width?: number }> = ({ width = 760 }) => (
  <div role="grid" aria-label="Inbox" style={{ width }}>
    {ROWS.map(({ name, props }) => (
      <div key={name} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', alignItems: 'start' }}>
        <span
          aria-hidden="true"
          style={{ padding: cssVar('sp-4'), fontSize: cssVar('type-meta'), color: cssVar('text-muted') }}
        >
          {name}
        </span>
        <NotificationRow {...props} />
      </div>
    ))}
  </div>
);

/** Spec 02: the states. Hover a row: the time gives its place to the actions. */
export const States: StoryObj = {
  render: () => (
    <div style={{ padding: cssVar('sp-6'), background: cssVar('bg-canvas') }}>
      <List />
    </div>
  ),
};

/** On a dark surface. */
export const Inverse: StoryObj = {
  render: () => (
    <Surface tone="inverse" style={{ padding: cssVar('sp-6') }}>
      <List />
    </Surface>
  ),
};
