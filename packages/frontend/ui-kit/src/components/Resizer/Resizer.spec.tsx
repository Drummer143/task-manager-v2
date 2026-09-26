import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Resizer, type ResizerProps } from './Resizer';

const setup = (props: Partial<ResizerProps> = {}) => {
  const onLive = vi.fn();
  const onCommit = vi.fn();
  const onSnap = vi.fn();

  render(
    <Resizer
      side="sidebar"
      value={260}
      min={200}
      max={420}
      defaultValue={260}
      onLive={onLive}
      onCommit={onCommit}
      onSnap={onSnap}
      controls="region"
      label="Resize sidebar"
      {...props}
    />,
  );

  return { onLive, onCommit, onSnap, resizer: screen.getByRole('separator', { name: 'Resize sidebar' }) };
};

/** Frames come when the test says so: a drag is checked frame by frame. */
let frames: FrameRequestCallback[] = [];

/** A pointer move, and the frame after it. */
const moveTo = (element: HTMLElement, clientX: number) => {
  fireEvent.pointerMove(element, { clientX });
  act(() => frames.splice(0).forEach((callback) => callback(0)));
};

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Resizer · for a screen reader', () => {
  it('is a focusable vertical separator with its value and limits', () => {
    const { resizer } = setup();

    expect(resizer.getAttribute('aria-orientation')).toBe('vertical');
    expect(resizer.getAttribute('aria-controls')).toBe('region');
    expect(resizer.getAttribute('aria-valuenow')).toBe('260');
    expect(resizer.getAttribute('aria-valuemin')).toBe('200');
    expect(resizer.getAttribute('aria-valuemax')).toBe('420');
    expect(resizer.tabIndex).toBe(0);
  });
});

describe('Resizer · pointer', () => {
  it('writes at most once a frame; the release counts even if its frame has not come', () => {
    const { resizer, onLive, onCommit } = setup();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 260 });
    fireEvent.pointerMove(resizer, { clientX: 280 });
    fireEvent.pointerMove(resizer, { clientX: 290 });
    expect(onLive).not.toHaveBeenCalled();

    fireEvent.pointerUp(resizer, { clientX: 295 });
    expect(onLive).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(295);
  });

  it('follows the pointer live and commits once, on release', () => {
    const { resizer, onLive, onCommit } = setup();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 260 });
    expect(resizer.hasAttribute('data-dragging')).toBe(true);
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(true);

    moveTo(resizer, 300);
    moveTo(resizer, 310);
    expect(onLive).toHaveBeenLastCalledWith(310);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.pointerUp(resizer, { clientX: 310 });
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(310);
    expect(document.documentElement.hasAttribute('data-resizing')).toBe(false);
  });

  it('a panel on the right grows to the left', () => {
    const { resizer, onLive } = setup({ side: 'panel', value: 420, min: 360, max: 640, defaultValue: 420 });

    fireEvent.pointerDown(resizer, { button: 0, clientX: 800 });
    moveTo(resizer, 760);

    expect(onLive).toHaveBeenLastCalledWith(460);
  });

  it('stops at the limits and shows it', () => {
    const { resizer, onLive } = setup();

    fireEvent.pointerDown(resizer, { button: 0, clientX: 260 });
    moveTo(resizer, 900);

    expect(onLive).toHaveBeenLastCalledWith(420);
    expect(resizer.hasAttribute('data-limit')).toBe(true);
  });

  it('snaps below snapBelow and back, in one gesture; the width stays what it was', () => {
    const { resizer, onLive, onSnap, onCommit } = setup({ snapBelow: 140 });

    fireEvent.pointerDown(resizer, { button: 0, clientX: 260 });
    moveTo(resizer, 100);
    expect(onSnap).toHaveBeenLastCalledWith(true);
    expect(resizer.hasAttribute('data-limit')).toBe(false);

    moveTo(resizer, 90);
    expect(onSnap).toHaveBeenCalledOnce();

    moveTo(resizer, 150);
    expect(onSnap).toHaveBeenLastCalledWith(false);
    expect(onLive).toHaveBeenLastCalledWith(200);

    fireEvent.pointerUp(resizer, { clientX: 150 });
    expect(onCommit).toHaveBeenCalledWith(200);
  });

  it('ignores anything but the main button', () => {
    const { resizer, onLive } = setup();

    fireEvent.pointerDown(resizer, { button: 2, clientX: 260 });
    moveTo(resizer, 300);

    expect(onLive).not.toHaveBeenCalled();
  });

  it('double click resets to the default, opening a collapsed region', () => {
    const { resizer, onLive, onCommit, onSnap } = setup({ value: 48, collapsed: true, snapBelow: 140 });

    fireEvent.doubleClick(resizer);

    expect(onSnap).toHaveBeenCalledWith(false);
    expect(onLive).toHaveBeenCalledWith(260);
    expect(onCommit).toHaveBeenCalledWith(260);
  });

  it('lights up only after the hover delay', () => {
    vi.useFakeTimers();
    const { resizer } = setup();

    fireEvent.pointerEnter(resizer);
    expect(resizer.hasAttribute('data-hover')).toBe(false);

    act(() => vi.advanceTimersByTime(150));
    expect(resizer.hasAttribute('data-hover')).toBe(true);

    fireEvent.pointerLeave(resizer);
    expect(resizer.hasAttribute('data-hover')).toBe(false);
  });
});

describe('Resizer · keyboard', () => {
  it('arrows step by 16, with Shift by 64; commits on key up', () => {
    const { resizer, onLive, onCommit } = setup();

    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    expect(onLive).toHaveBeenLastCalledWith(292);

    fireEvent.keyDown(resizer, { key: 'ArrowLeft', shiftKey: true });
    expect(onLive).toHaveBeenLastCalledWith(228);
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.keyUp(resizer, { key: 'ArrowLeft' });
    expect(onCommit).toHaveBeenCalledWith(228);
  });

  it('directions follow the screen: → narrows a panel', () => {
    const { resizer, onLive } = setup({ side: 'panel', value: 420, min: 360, max: 640, defaultValue: 420 });

    fireEvent.keyDown(resizer, { key: 'ArrowRight' });

    expect(onLive).toHaveBeenLastCalledWith(404);
  });

  it('Home and End go to the limits — Home is the minimum, not a collapse', () => {
    const { resizer, onLive, onSnap } = setup({ snapBelow: 140 });

    fireEvent.keyDown(resizer, { key: 'Home' });
    expect(onLive).toHaveBeenLastCalledWith(200);
    fireEvent.keyDown(resizer, { key: 'End' });
    expect(onLive).toHaveBeenLastCalledWith(420);
    expect(onSnap).not.toHaveBeenCalled();
  });

  it('past the minimum collapses a region that can, keeping its width', () => {
    const { resizer, onSnap, onCommit, onLive } = setup({ value: 200, snapBelow: 140 });

    fireEvent.keyDown(resizer, { key: 'ArrowLeft' });

    expect(onSnap).toHaveBeenCalledWith(true);
    expect(onCommit).toHaveBeenCalledWith(200);
    expect(onLive).not.toHaveBeenCalled();
  });

  it('a collapsed region opens by → to its minimum; ← does nothing', () => {
    const { resizer, onSnap, onLive } = setup({ value: 48, collapsed: true, snapBelow: 140 });

    fireEvent.keyDown(resizer, { key: 'ArrowLeft' });
    expect(onLive).not.toHaveBeenCalled();
    expect(onSnap).not.toHaveBeenCalled();

    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    expect(onSnap).toHaveBeenCalledWith(false);
    expect(onLive).toHaveBeenLastCalledWith(200);
  });

  it('Enter resets to the default', () => {
    const { resizer, onCommit } = setup({ value: 380 });

    fireEvent.keyDown(resizer, { key: 'Enter' });

    expect(onCommit).toHaveBeenCalledWith(260);
  });

  it('leaving with keys pressed still commits', () => {
    const { resizer, onCommit } = setup();

    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    fireEvent.blur(resizer);

    expect(onCommit).toHaveBeenCalledWith(276);
  });
});
