import { createRef } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raw } from '../../tokens';
import Progress, { type ProgressProps } from './Progress';
import styles from './Progress.module.scss';

const renderNow = (props: ProgressProps = {}) => render(<Progress delay={0} {...props} />);

const bar = () => screen.getByRole('progressbar');
const thumb = () => bar().firstElementChild as HTMLElement;
const drawnValue = () => bar().style.getPropertyValue('--progress-value');

describe('Progress · accessibility', () => {
  it('is a progressbar with a default label', () => {
    renderNow();

    screen.getByRole('progressbar', { name: 'Loading' });
  });

  it('uses a specific label when given', () => {
    renderNow({ label: 'Uploading attachment' });

    screen.getByRole('progressbar', { name: 'Uploading attachment' });
  });

  it('hides the drawn bar from screen readers', () => {
    renderNow({ value: 0.4 });

    expect(thumb().getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Progress · indeterminate', () => {
  it('is indeterminate when no value is passed', () => {
    renderNow();

    expect(bar().getAttribute('data-indeterminate')).toBe('true');
  });

  it('omits the value attributes — that is how readers know the duration is unknown', () => {
    renderNow();

    expect(bar().hasAttribute('aria-valuenow')).toBe(false);
    expect(bar().hasAttribute('aria-valuemin')).toBe(false);
    expect(bar().hasAttribute('aria-valuemax')).toBe(false);
  });

  it('does not set a drawn value', () => {
    renderNow();

    expect(drawnValue()).toBe('');
  });
});

describe('Progress · determinate', () => {
  it('is determinate when a value is passed', () => {
    renderNow({ value: 0.62 });

    expect(bar().getAttribute('data-indeterminate')).toBe('false');
  });

  it('takes 0..1 and announces it as a 0–100 range', () => {
    renderNow({ value: 0.62 });

    expect(bar().getAttribute('aria-valuemin')).toBe('0');
    expect(bar().getAttribute('aria-valuemax')).toBe('100');
    expect(bar().getAttribute('aria-valuenow')).toBe('62');
  });

  it('announces a whole number but draws the exact value', () => {
    renderNow({ value: 0.426 });

    expect(bar().getAttribute('aria-valuenow')).toBe('43');
    expect(drawnValue()).toBe('0.426');
  });

  it('treats 0 as a value, not as "unknown"', () => {
    renderNow({ value: 0 });

    expect(bar().getAttribute('data-indeterminate')).toBe('false');
    expect(bar().getAttribute('aria-valuenow')).toBe('0');
    expect(drawnValue()).toBe('0');
  });

  it.each([
    [1.5, '1', '100'],
    [-0.2, '0', '0'],
  ])('clamps %f into range', (value, drawn, announced) => {
    renderNow({ value });

    expect(drawnValue()).toBe(drawn);
    expect(bar().getAttribute('aria-valuenow')).toBe(announced);
  });

  it('draws the length through the value variable, never through an inline width', () => {
    renderNow({ value: 0.5 });

    expect(thumb().style.width).toBe('');
  });

  it('keeps the caller style next to the drawn value', () => {
    renderNow({ value: 0.5, style: { marginTop: '0' } });

    expect(bar().style.marginTop).toBe('0px');
    expect(drawnValue()).toBe('0.5');
  });
});

describe('Progress · switching modes', () => {
  it('keeps the same element when the size becomes known, so nothing remounts', () => {
    const { rerender } = renderNow({ label: 'Uploading attachment' });
    const before = bar();

    rerender(<Progress delay={0} label="Uploading attachment" value={0.1} />);

    expect(bar()).toBe(before);
    expect(bar().getAttribute('data-indeterminate')).toBe('false');
    expect(bar().getAttribute('aria-valuenow')).toBe('10');
  });

  it('drops the value attributes when it goes back to indeterminate', () => {
    const { rerender } = renderNow({ value: 0.3 });

    rerender(<Progress delay={0} />);

    expect(bar().getAttribute('data-indeterminate')).toBe('true');
    expect(bar().hasAttribute('aria-valuenow')).toBe(false);
    expect(drawnValue()).toBe('');
  });
});

describe('Progress · delay', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  const root = () => screen.getByTestId('progress');

  it('holds its place but draws and announces nothing until the default delay passes', () => {
    render(<Progress data-testid="progress" />);

    expect(root().classList.contains(styles.pending)).toBe(true);
    expect(root().getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('progressbar')).toBeNull();

    advance(raw['spinner-delay'] - 1);
    expect(root().classList.contains(styles.pending)).toBe(true);

    advance(1);
    expect(root().classList.contains(styles.pending)).toBe(false);
    expect(root().hasAttribute('aria-hidden')).toBe(false);
    screen.getByRole('progressbar');
  });

  it('honors a custom delay', () => {
    render(<Progress data-testid="progress" delay={500} />);

    advance(499);
    expect(root().classList.contains(styles.pending)).toBe(true);

    advance(1);
    expect(root().classList.contains(styles.pending)).toBe(false);
  });

  it('shows at once with delay 0', () => {
    render(<Progress data-testid="progress" delay={0} />);

    expect(root().classList.contains(styles.pending)).toBe(false);
  });

  it('does not restart the delay when the size becomes known', () => {
    const { rerender } = render(<Progress data-testid="progress" />);

    advance(raw['spinner-delay']);
    rerender(<Progress data-testid="progress" value={0.2} />);

    expect(root().classList.contains(styles.pending)).toBe(false);
  });

  it('never fires after unmount during the delay', () => {
    const { unmount } = render(<Progress data-testid="progress" />);

    advance(100);
    unmount();

    expect(() => advance(1000)).not.toThrow();
  });
});

describe('Progress · DOM contract', () => {
  it('forwards className, ref and other DOM props to the root', () => {
    const ref = createRef<HTMLDivElement>();
    renderNow({ ref, className: 'custom', id: 'upload', ...{ 'data-testid': 'progress' } });
    const root = screen.getByTestId('progress');

    expect(ref.current).toBe(root);
    expect(root.id).toBe('upload');
    expect(root.classList.contains('custom')).toBe(true);
    expect(root.classList.contains(styles.root)).toBe(true);
  });

  it('lets the caller name it with aria-labelledby instead', () => {
    render(
      <>
        <span id="upload-label">Uploading report.pdf</span>
        <Progress delay={0} aria-labelledby="upload-label" aria-label={undefined} value={0.2} />
      </>,
    );

    screen.getByRole('progressbar', { name: 'Uploading report.pdf' });
  });
});
