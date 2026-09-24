import { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useEffect, useRef, useState } from 'react';
import Progress from './Progress';
import { Surface } from '../Surface';
import { cssVar, raw } from '../../tokens';

/* Demo scaffolding only. Progress takes its container's width, so every story
   gives it one — in a centered layout it would otherwise collapse to nothing. */
const frame: CSSProperties = { width: cssVar('column-width') };

const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `max-content ${cssVar('column-width')}`,
  gap: `${cssVar('sp-5')} ${cssVar('sp-6')}`,
  alignItems: 'center',
  padding: cssVar('sp-6'),
  fontSize: cssVar('type-meta'),
  color: cssVar('text-secondary'),
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

/** The design's reference set: unknown duration, then the known values. */
function StandContent() {
  return (
    <>
      <Caption>indeterminate</Caption>
      <Progress label="Loading board" />

      {[0, 0.25, 0.62, 1].map((value) => (
        <div key={value} style={{ display: 'contents' }}>
          <Caption>determinate · {percent(value)}</Caption>
          <Progress label="Uploading attachment" value={value} />
        </div>
      ))}
    </>
  );
}

const meta: Meta<typeof Progress> = {
  title: 'Primitives/Progress',
  component: Progress,
  parameters: { layout: 'centered' },
  argTypes: {
    value: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
      description: '0..1. Leave empty for an indeterminate bar (unknown duration).',
    },
    label: { control: 'text' },
    delay: { control: { type: 'number', min: 0, step: 50 } },
    ref: { control: false },
    className: { control: false },
  },
  args: {
    label: 'Loading',
    value: 0.5,
  },
  render: (args) => (
    <div style={frame}>
      <Progress {...args} />
    </div>
  ),
};

export default meta;

type Story = StoryObj<typeof Progress>;

/** Indeterminate: a segment runs across the track. */
export const Default: Story = {
  argTypes: {
    value: { control: false },
  },
  args: {
    value: undefined,
  },
};

/** Determinate: drag the value in the controls. */
export const Determinate: Story = {
  args: {
    label: 'Uploading attachment',
    value: 0.62,
  },
};

/** The value grows in steps; each step animates over --progress-transition. */
export const WithValue: Story = {
  render: (args) => {
    const [progressValue, setProgressValue] = useState(args.value ?? 0);

    useEffect(() => {
      if (args.value !== undefined) {
        setProgressValue(args.value);
      }
    }, [args.value]);

    return (
      <div style={{ ...frame, display: 'grid', gap: cssVar('sp-4') }}>
        <Progress {...args} value={progressValue} />

        <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-4') }}>
          {/* Wraps to 0 only after reaching 100, so the full bar is visible too. */}
          <button
            type="button"
            onClick={() => setProgressValue((prev) => (prev >= 1 ? 0 : Math.min(1, Math.round((prev + 0.2) * 100) / 100)))}
          >
            + 20%
          </button>
          <Caption>{percent(progressValue)}</Caption>
        </div>
      </div>
    );
  },
};

/** Every state in one place — the acceptance stand. */
export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StandContent />
    </div>
  ),
};

/**
 * One component for both modes: an upload starts before its size is known and
 * switches to determinate in place — no remount, no jump, no second delay.
 */
export const UnknownThenKnown: Story = {
  render: () => {
    const [value, setValue] = useState<number | undefined>(undefined);
    const [run, setRun] = useState(0);
    const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

    useEffect(() => {
      setValue(undefined);

      // 1.5 s of unknown size, then 20% steps every 600 ms.
      const steps = [0.2, 0.4, 0.6, 0.8, 1];
      timers.current = steps.map((step, index) => setTimeout(() => setValue(step), 1500 + index * 600));

      return () => timers.current.forEach(clearTimeout);
    }, [run]);

    return (
      <div style={{ ...frame, display: 'grid', gap: cssVar('sp-4') }}>
        <Progress label="Uploading attachment" value={value} />

        <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-4') }}>
          <button type="button" onClick={() => setRun((prev) => prev + 1)}>
            Restart
          </button>
          <Caption>{value === undefined ? 'size unknown' : percent(value)}</Caption>
        </div>
      </div>
    );
  },
};

/** Real places from the spec: under the canvas header, and in an attachment row. */
export const InContext: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={{ display: 'grid', gap: cssVar('sp-6'), padding: cssVar('sp-6') }}>
      <div
        style={{
          border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
          borderRadius: cssVar('radius-sm'),
          background: cssVar('bg-raised'),
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            height: cssVar('canvas-header-height'),
            padding: `0 ${cssVar('sp-5')}`,
            fontSize: cssVar('type-body'),
          }}
        >
          Q3 board
        </div>
        {/* The header positions the bar; Progress only fills the width it gets. */}
        <Progress label="Refreshing board" />
        <div style={{ height: cssVar('sp-8'), padding: cssVar('sp-5'), color: cssVar('text-muted') }}>
          Previous data stays on screen while it refreshes.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: cssVar('sp-4'),
          width: cssVar('panel-width'),
          fontSize: cssVar('type-body'),
        }}
      >
        <span id="attachment-name">report-q3.pdf</span>
        {/* In a flex row the parent gives the bar its share of the width. */}
        <div style={{ flex: 1 }}>
          <Progress aria-labelledby="attachment-name" aria-label={undefined} value={0.62} />
        </div>
        <Caption>{percent(0.62)}</Caption>
      </div>
    </div>
  ),
};

/**
 * On a dark surface the bar takes the light accent step (accent-400) and the
 * track should be light at 14% — no prop, the surface swaps the tokens.
 */
export const OnInverseSurface: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <Surface tone="inverse" style={stand}>
      <StandContent />
    </Surface>
  ),
};

/**
 * prefers-reduced-motion: determinate jumps without animation; indeterminate
 * becomes a full-width bar breathing 30 ↔ 60%. The breathing needs the real
 * media query — turn it on in DevTools (Ctrl+Shift+P → "Emulate CSS
 * prefers-reduced-motion: reduce"). The jump is simulated below by the same
 * token override tokens.css applies under the media query.
 */
export const ReducedMotion: Story = {
  render: () => {
    const [value, setValue] = useState(0.2);
    const next = () => setValue((prev) => (prev >= 1 ? 0 : Math.min(1, Math.round((prev + 0.4) * 100) / 100)));

    return (
      <div style={{ ...stand, padding: 0 }}>
        <Caption>normal</Caption>
        <Progress label="Uploading attachment" value={value} />

        <Caption>reduced · jump</Caption>
        <div style={{ '--progress-transition': '0ms' } as CSSProperties}>
          <Progress label="Uploading attachment" value={value} />
        </div>

        <Caption>indeterminate</Caption>
        <Progress label="Loading board" />

        <span />
        <div>
          <button type="button" onClick={next}>
            Next value
          </button>
        </div>
      </div>
    );
  },
};

/**
 * The 200 ms delay: fast operations never flash a bar. The track takes its
 * place at once but stays invisible (and silent) until the delay passes.
 * Remount to watch it again; drag `delay` in the controls to compare.
 */
export const Delay: Story = {
  args: { label: 'Loading board', value: undefined },
  render: (args) => {
    const [mount, setMount] = useState(0);

    return (
      <div style={{ ...frame, display: 'grid', gap: cssVar('sp-4') }}>
        <Progress key={mount} {...args} />
        <div style={{ display: 'flex', alignItems: 'center', gap: cssVar('sp-4') }}>
          <button type="button" onClick={() => setMount((prev) => prev + 1)}>
            Remount
          </button>
          <Caption>appears after {args.delay ?? raw['spinner-delay']} ms</Caption>
        </div>
      </div>
    );
  },
};
