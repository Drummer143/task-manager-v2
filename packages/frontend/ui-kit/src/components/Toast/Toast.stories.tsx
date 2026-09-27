import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, useRef, useState } from 'react';
import { toast } from './store';
import { useToastArea } from './ToastHost';
import type { ToastNotification } from './types';
import { Avatar } from '../Avatar';
import { Button } from '../Button';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const stand: CSSProperties = {
  display: 'grid',
  gap: cssVar('sp-4'),
  padding: cssVar('sp-6'),
  fontFamily: cssVar('font-ui'),
  fontSize: cssVar('type-meta'),
  color: cssVar('text-secondary'),
};

const buttons: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: cssVar('sp-3') };

/* Demo scaffolding: a board-ish canvas that registers itself as the toast area, like AppShell does. */
function Canvas({ tone }: { tone?: 'inverse' }) {
  const ref = useRef<HTMLDivElement>(null);

  useToastArea(ref);

  const column = (left: string): CSSProperties => ({
    position: 'absolute',
    top: cssVar('sp-4'),
    bottom: cssVar('sp-4'),
    left,
    width: cssVar('column-width'),
    borderRadius: cssVar('radius-md'),
    background: cssVar('bg-sunken'),
  });

  const canvas = (
    <div
      ref={ref}
      style={{
        position: 'relative',
        height: `calc(${cssVar('sp-8')} * 7)`,
        overflow: 'hidden',
        border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
        borderRadius: cssVar('radius-sm'),
        background: cssVar('bg-surface'),
      }}
    >
      <div style={column(cssVar('sp-4'))} />
      <div style={column(`calc(${cssVar('column-width')} + 2 * ${cssVar('sp-4')})`)} />
    </div>
  );

  return tone ? <Surface tone={tone}>{canvas}</Surface> : canvas;
}

/** The app's side of an operation: done at once, undone through the history. */
function useDemo(log: (message: string) => void) {
  const [done, setDone] = useState(0);

  return {
    move: () =>
      toast.undo({
        message: '3 tasks moved to Done',
        undo: () => log('Undone: moved back 3 tasks'),
        redo: () => log('Redone: 3 tasks moved to Done again'),
      }),
    trash: () =>
      toast.undo({
        message: '“Q3 retro” moved to trash',
        detail: 'With 12 tasks',
        undo: () => log('Undone: “Q3 retro” restored'),
      }),
    bulk: () => {
      let step = 0;
      const total = 40;
      const run = toast.progress({
        message: `Moving ${total} tasks…`,
        total,
        onCancel: () => {
          clearInterval(timer);
          log(`Cancelled at ${step} of ${total}: what moved stays, and mod+Z undoes it`);
        },
      });
      const timer = setInterval(() => {
        step += 2;
        run.update(step, `Moving ${total} tasks… ${step} of ${total}`);

        if (step >= total) {
          clearInterval(timer);
          run.succeed({ message: `${total} tasks moved to Review`, undo: () => log(`Undone: moved back ${total} tasks`) });
        }
      }, 150);
    },
    conflict: () =>
      toast.error({
        message: 'Couldn’t move 2 of 12 tasks',
        detail: 'They were changed by Ivan Petrov',
        retry: () => log('Retry: 2 tasks moved'),
        secondary: { label: 'Show', onAction: () => log('Show: the 2 tasks are selected on the board') },
      }),
    failingUndo: () =>
      toast.undo({
        message: 'Status set to Blocked',
        undo: () => Promise.reject(new Error('offline')),
      }),
    copy: () => {
      setDone(done + 1);
      toast.note('Link copied');
    },
  };
}

const mention = (id: number): ToastNotification => ({
  id: `n-${id}`,
  kind: 'mentioned',
  avatar: <Avatar name="Mira Sato" size="sm" />,
  title: (
    <>
      <b>Mira Sato</b> mentioned you
    </>
  ),
  context: (
    <>
      <span style={{ fontFamily: cssVar('font-mono') }}>TM-248</span> “Can we reuse the undo toast here?”
    </>
  ),
  announcement: 'Mira Sato mentioned you in TM-248: Can we reuse the undo toast here?',
  subjectId: 'TM-248',
  onOpen: () => undefined,
});

function Live({ tone }: { tone?: 'inverse' }) {
  const [log, setLog] = useState('Press a button: the toast appears at the bottom of the canvas.');
  const demo = useDemo(setLog);
  const notices = useRef(0);

  return (
    <div style={stand}>
      <div style={buttons}>
        <Button onClick={demo.move}>Move 3 tasks to Done</Button>
        <Button onClick={demo.trash}>Delete page</Button>
        <Button onClick={demo.bulk}>Move 40 tasks</Button>
        <Button onClick={demo.conflict}>Bulk move with conflict</Button>
        <Button onClick={demo.failingUndo}>Undo that fails</Button>
        <Button onClick={demo.copy}>Copy link</Button>
        <Button
          onClick={() => {
            notices.current += 1;
            toast.notify({ ...mention(notices.current), onOpen: () => setLog('Open → TM-248 in the panel') });
          }}
        >
          Simulate mention
        </Button>
        <Button onClick={() => toast.withdraw('TM-248')}>Delete TM-248</Button>
      </div>
      <Canvas tone={tone} />
      <span>{log}</span>
      <span>
        Hover the toast — its timer stands. mod+Z / mod+Shift+Z undo and redo the last operation, even after the toast is
        gone. A new toast replaces the current one; an error waits for its decision. F8 goes to the toasts and back, Esc
        closes. A notification shows at most once in 30 s; while it is on screen new ones add “+N more”.
      </span>
    </div>
  );
}

const meta: Meta = {
  title: 'Feedback/Toast',
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj;

export const Playground: Story = { render: () => <Live /> };

/** On a dark canvas the toast takes the opposite surface — the light one. */
export const OnDarkCanvas: Story = { render: () => <Live tone="inverse" /> };
