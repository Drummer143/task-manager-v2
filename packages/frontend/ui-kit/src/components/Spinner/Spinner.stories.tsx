import { Meta, StoryObj } from '@storybook/react-vite';
import Spinner, { type SpinnerSize, type SpinnerVariant } from './Spinner';
import { CSSProperties, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useDelayedFlag } from '../../hooks/useDelayedFlag';
import { Surface } from '../Surface';
import { cssVar, raw } from '../../tokens';

const SIZES: SpinnerSize[] = ['xs', 'sm', 'md', 'lg'];
const VARIANTS: SpinnerVariant[] = ['accent', 'neutral', 'danger'];

/* Demo scaffolding only — lays spinners out like the design stand. */
const stand: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'max-content repeat(4, max-content)',
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
  gap: `${cssVar('sp-4')} ${cssVar('sp-6')}`,
};

/** A spinner leading a line of text, as in list rows. */
const textRow: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: cssVar('sp-3'),
  fontSize: cssVar('type-body'),
};

function Caption({ children }: { children: ReactNode }) {
  return <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{children}</span>;
}

/** Button does not exist yet — the spinner takes the icon's place, as in the spec. */
function MockButton({ children, primary }: { children: ReactNode; primary?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: cssVar('sp-3'),
        height: cssVar('control-height'),
        padding: `0 ${cssVar('sp-4')}`,
        border: `${cssVar('border-width')} solid ${primary ? cssVar('border-accent') : cssVar('border-hairline')}`,
        borderRadius: cssVar('radius-sm'),
        background: cssVar('bg-raised'),
        color: cssVar('text-primary'),
        fontSize: cssVar('type-body'),
      }}
    >
      {children}
    </span>
  );
}

/** Sizes × tones, and the spinner in its real places. Reads semantics only. */
function StandContent() {
  return (
    <>
      <span />
      {SIZES.map((size) => (
        <Caption key={size}>
          {size} · {raw[`spinner-size-${size}`]}
        </Caption>
      ))}

      {VARIANTS.map((variant) => (
        <div key={variant} style={{ display: 'contents' }}>
          <Caption>{variant}</Caption>
          {SIZES.map((size) => (
            <Spinner key={size} size={size} variant={variant} />
          ))}
        </div>
      ))}

      <Caption>in context</Caption>
      <div style={{ ...row, gridColumn: 'span 4' }}>
        <MockButton primary>
          <Spinner size="xs" variant="accent" label="Creating task" /> Create task
        </MockButton>
        <span style={textRow}>
          <Spinner size="xs" label="Uploading attachment" /> Uploading attachment
        </span>
        <span style={textRow}>
          <Spinner size="xs" label="Searching people" /> Searching people…
        </span>
      </div>
    </>
  );
}

const meta: Meta<typeof Spinner> = {
  title: 'Primitives/Spinner',
  component: Spinner,
  parameters: { layout: 'centered' },
  argTypes: {
    variant: {
      control: 'select',
      options: VARIANTS,
    },
    size: {
      control: 'select',
      options: SIZES,
    },
    label: {
      control: 'text',
    },
    ref: {
      control: false,
    },
    className: {
      control: false,
    },
  },
  args: {
    label: 'Loading',
    variant: 'neutral',
    size: 'sm',
  },
};

export default meta;

type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};

/** Every size in every tone, plus the spinner in a button and in text rows. */
export const Gallery: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div style={stand}>
      <StandContent />
    </div>
  ),
};

/**
 * On a dark surface the tones take light steps (accent-400, danger-300,
 * neutral near-white). No prop — the inverse surface swaps the tokens.
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
 * prefers-reduced-motion slows the turn to 1600 ms instead of stopping it —
 * a still ring would look frozen. Simulated here by overriding --spin-duration,
 * exactly what tokens.css does under the media query.
 */
export const ReducedMotion: Story = {
  render: (args) => (
    <div style={row}>
      <div style={{ display: 'grid', gap: cssVar('sp-3'), justifyItems: 'center' }}>
        <Spinner {...args} size="md" />
        <Caption>normal · {raw['spin-duration']} ms</Caption>
      </div>
      <div
        style={
          { display: 'grid', gap: cssVar('sp-3'), justifyItems: 'center', '--spin-duration': '1600ms' } as CSSProperties
        }
      >
        <Spinner {...args} size="md" />
        <Caption>reduced · 1600 ms</Caption>
      </div>
    </div>
  ),
};

/**
 * Slowed down for the eye: delay 1 s, minimum 5 s, the request lasts 2 s — you
 * can watch every phase of useDelayedFlag. Real timings: see LiveTimings.
 */
export const WithDelay: Story = {
  args: {
    label: 'Loading',
    variant: 'neutral',
    size: 'sm',
  },
  render: (args) => {
    const [isVisible, setIsVisible] = useState(false);
    const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

    const show = useDelayedFlag(isVisible, { delay: 1000, minVisible: 5000 });

    const run = useCallback(() => {
      clearTimeout(timeout.current);
      setIsVisible(true);

      timeout.current = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
    }, []);

    useEffect(() => {
      run();

      return () => {
        clearTimeout(timeout.current);
      };
    }, [run]);

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        <p>
          {isVisible
            ? show
              ? 'Spinner visible'
              : 'Waiting delay before showing'
            : show
              ? 'Spinner visible (minVisible active)'
              : 'Spinner hidden'}
        </p>

        {!isVisible && !show && <button onClick={run}>Show</button>}

        {show && <Spinner {...args} />}
      </div>
    );
  },
};

const REQUESTS = [
  { name: 'Fast', ms: 120 },
  { name: 'Medium', ms: 300 },
  { name: 'Slow', ms: 1500 },
];

/**
 * Real timings from tokens (delay 200 ms, minimum 400 ms), like the design's
 * live stand. Fast never shows a spinner; Medium shows it past the request's
 * end to reach the minimum; Slow hides it as soon as the request is done.
 */
export const LiveTimings: Story = {
  render: (args) => {
    const [busy, setBusy] = useState(false);
    const [log, setLog] = useState('Press a button to run a request');
    const visible = useDelayedFlag(busy);

    const request = useRef<{ name: string; ms: number } | null>(null);
    const shownAt = useRef<number | null>(null);
    /** Did the spinner appear during the current request? */
    const wasShown = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    // Spinner appeared / disappeared → measure how long it was on screen.
    useEffect(() => {
      if (visible) {
        shownAt.current = performance.now();
        wasShown.current = true;
      } else if (shownAt.current !== null && request.current) {
        const shown = Math.round(performance.now() - shownAt.current);
        setLog(`${request.current.name} · ${request.current.ms} ms request → spinner on screen ${shown} ms`);
        shownAt.current = null;
      }
    }, [visible]);

    // Request finished and the spinner never showed up.
    useEffect(() => {
      if (!busy && !visible && !wasShown.current && request.current) {
        setLog(`${request.current.name} · ${request.current.ms} ms request → no spinner at all`);
      }
    }, [busy, visible]);

    const run = (next: { name: string; ms: number }) => {
      clearTimeout(timer.current);
      request.current = next;
      wasShown.current = false;
      setLog(`${next.name} · running…`);
      setBusy(true);
      timer.current = setTimeout(() => setBusy(false), next.ms);
    };

    return (
      <div style={{ display: 'grid', gap: cssVar('sp-4'), justifyItems: 'start', fontSize: cssVar('type-body') }}>
        <div style={row}>
          {REQUESTS.map((item) => (
            <button key={item.name} type="button" disabled={busy || visible} onClick={() => run(item)}>
              {item.name} · {item.ms} ms
            </button>
          ))}
        </div>

        <div style={{ ...row, height: cssVar('control-height'), fontVariantNumeric: cssVar('num-tabular') }}>
          <Caption>busy: {String(busy)}</Caption>
          <Caption>visible: {String(visible)}</Caption>
          {visible && <Spinner {...args} />}
        </div>

        <Caption>{log}</Caption>
      </div>
    );
  },
};
