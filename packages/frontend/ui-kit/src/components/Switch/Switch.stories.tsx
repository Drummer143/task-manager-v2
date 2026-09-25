import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComponentProps, CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import { Switch } from './Switch';
import { Surface } from '../Surface';
import { cssVar } from '../../tokens';

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content repeat(3, max-content)',
  gap: `${cssVar('sp-3')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

function Owned({ initial = false, ...props }: { initial?: boolean } & Omit<ComponentProps<typeof Switch>, 'checked' | 'onCheckedChange'>) {
  const [checked, setChecked] = useState(initial);

  return <Switch {...props} checked={checked} onCheckedChange={setChecked} />;
}

/** Off / on × states. Hover and press are live on the row: the thumb stretches while pressed. */
function StateGrid() {
  return (
    <>
      <span />
      {['default · live', 'disabled · reason', 'pending'].map((state) => (
        <Caption key={state}>{state}</Caption>
      ))}
      {[false, true].map((value) => (
        <div key={String(value)} style={{ display: 'contents' }}>
          <Caption>{value ? 'on' : 'off'}</Caption>
          <Owned label="Compact" labelPosition="end" initial={value} />
          <Switch
            label="Compact"
            labelPosition="end"
            checked={value}
            onCheckedChange={() => undefined}
            disabled
            disabledReason="Set by the workspace owner"
          />
          <Owned label="Compact" labelPosition="end" initial={value} pending />
        </div>
      ))}
    </>
  );
}

const meta: Meta<typeof Switch> = {
  title: 'Primitives/Switch',
  component: Switch,
  parameters: { layout: 'centered' },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StateGrid />
    </div>
  ),
};

/**
 * A settings list: label on the left, switch at the right edge. The second row
 * "waits for the server" 600 ms — the dot shows it; "Fail the next save" makes
 * the next toggle fail: the thumb goes back, the line offers Retry.
 */
export const SettingsRows: Story = {
  render: () => {
    const [completed, setCompleted] = useState(true);
    const [email, setEmail] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string>();
    const [failNext, setFailNext] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const saveEmail = (next: boolean) => {
      const fail = failNext;
      setFailNext(false);
      setError(undefined);
      // Optimistic: the thumb is already there; only the dot says it is in flight.
      setEmail(next);
      setPending(true);
      timer.current = setTimeout(() => {
        setPending(false);

        if (fail) {
          setEmail(!next);
          setError('Not saved: offline');
        }
      }, 600);
    };

    return (
      <div style={{ display: 'grid', width: cssVar('panel-width') }}>
        <Switch
          label="Show completed"
          description="The “Done” column on the board"
          checked={completed}
          onCheckedChange={setCompleted}
        />
        <Switch
          label="Email notifications"
          checked={email}
          pending={pending}
          error={error}
          onRetry={() => saveEmail(!email)}
          onCheckedChange={saveEmail}
        />
        <Switch label="Unavailable" checked={false} onCheckedChange={() => undefined} disabled disabledReason="Set by the workspace owner" />
        <label style={{ display: 'flex', gap: cssVar('sp-3'), marginTop: cssVar('sp-4'), fontSize: cssVar('type-meta'), color: cssVar('text-secondary') }}>
          <input type="checkbox" checked={failNext} onChange={(event) => setFailNext(event.target.checked)} />
          Fail the next save
        </label>
      </div>
    );
  },
};

/** In a toolbar the switch goes first. */
export const InToolbar: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: cssVar('sp-6') }}>
      <Owned label="Compact" labelPosition="end" />
      <Owned label="Show completed" labelPosition="end" initial />
    </div>
  ),
};

/** On a dark surface: transparent track, light border, accent-400 when on. */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StateGrid />
    </Surface>
  ),
};

/** The track stays 28 × 16; its hit zone — the row — follows the density. */
export const Densities: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ ...stand, gridTemplateColumns: 'max-content max-content' }}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'contents' }}>
          <Caption>{density}</Caption>
          <div style={{ outline: `${cssVar('border-width')} dashed ${cssVar('border-hairline')}` }}>
            <Owned label="Show completed" labelPosition="end" initial />
          </div>
        </div>
      ))}
    </div>
  ),
};
