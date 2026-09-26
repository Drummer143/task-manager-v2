import { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresence } from './usePresence';

const Overlay = ({ open, animation }: { open: boolean; animation?: string }) => {
  const ref = useRef<HTMLDivElement>(null);
  const mounted = usePresence(open, ref);

  // Longhands: jsdom does not expand the `animation` shorthand in getComputedStyle.
  const style = animation ? { animationName: 'overlay-out', animationDuration: animation } : undefined;

  return mounted ? <div ref={ref} data-testid="overlay" style={style} /> : null;
};

const overlay = () => document.querySelector('[data-testid="overlay"]');

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts in the same render as open — the entry animation starts on the first frame', () => {
    const view = render(<Overlay open={false} />);
    expect(overlay()).toBeNull();

    view.rerender(<Overlay open />);
    expect(overlay()).not.toBeNull();
  });

  it('unmounts at once when there is no exit animation', () => {
    const view = render(<Overlay open />);

    view.rerender(<Overlay open={false} />);

    expect(overlay()).toBeNull();
  });

  it('stays for the exit animation and goes on animationend', () => {
    const view = render(<Overlay open animation="120ms" />);

    view.rerender(<Overlay open={false} animation="120ms" />);
    expect(overlay()).not.toBeNull();

    act(() => {
      overlay()?.dispatchEvent(new Event('animationend'));
    });
    expect(overlay()).toBeNull();
  });

  it('goes anyway after the animation length — a background tab may never send animationend', () => {
    const view = render(<Overlay open animation="120ms" />);

    view.rerender(<Overlay open={false} animation="120ms" />);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(overlay()).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(overlay()).toBeNull();
  });

  it('stays when reopened during the exit', () => {
    const view = render(<Overlay open animation="120ms" />);

    view.rerender(<Overlay open={false} animation="120ms" />);
    view.rerender(<Overlay open animation="120ms" />);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(overlay()).not.toBeNull();
  });
});
