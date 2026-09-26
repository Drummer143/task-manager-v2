import { act, fireEvent, render, screen } from '@testing-library/react';
import React, { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEscapeStore } from '../../interaction/escape/store';
import { AppShell } from './AppShell';
import { DEFAULT_PREFS, resolveShell } from './resolveShell';
import { STORAGE_KEY, readPrefs, toggleSidebar, useShellStore } from './shellStore';
import { useSidebar } from './SidebarContext';

const setWidth = (vw: number) => act(() => useShellStore.getState().setViewport(vw));
const pressEscape = () => act(() => void useEscapeStore.getState().handleEscape());
const shell = () => document.querySelector<HTMLElement>('[data-sidebar]') as HTMLElement;
const sidebarResizer = () => screen.queryByRole('separator', { name: 'Resize sidebar' });
const panelResizer = () => screen.queryByRole('separator', { name: 'Resize panel' });

beforeEach(() => {
  localStorage.clear();
  useShellStore.setState({
    prefs: DEFAULT_PREFS,
    vw: 1280,
    panelOpen: false,
    peek: false,
    layout: resolveShell(1280, DEFAULT_PREFS, false),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Frames come when the test says so. */
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

const Frame = ({ panel = null, onPanelClose, scrollKey }: { panel?: ReactNode; onPanelClose?(): void; scrollKey?: string }) => (
  <AppShell
    sidebar={<button type="button">NAV</button>}
    status={<div>SYNC</div>}
    header={<div>HEAD</div>}
    panel={panel}
    onPanelClose={onPanelClose}
    scrollKey={scrollKey}
  >
    <button type="button">ROW</button>
  </AppShell>
);

/** A panel the frame can close, as an app would: Esc and the button set it to null. */
const WithPanel = () => {
  const [open, setOpen] = useState(true);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        OPEN
      </button>
      <Frame
        panel={open ? <button type="button" onClick={() => setOpen(false)}>CLOSE</button> : null}
        onPanelClose={() => setOpen(false)}
      />
    </>
  );
};

describe('AppShell · regions', () => {
  it('lays out the landmarks and keeps a closed panel out of the DOM', () => {
    render(<Frame />);

    expect(screen.getByRole('complementary', { name: 'Sidebar' }).textContent).toBe('NAVSYNC');
    expect(screen.getByRole('banner').textContent).toBe('HEAD');
    expect(screen.getByRole('main')?.getAttribute('id')).toBe('canvas');
    expect(screen.getByRole('main')?.getAttribute('tabindex')).toBe('-1');
    expect(screen.queryByRole('complementary', { name: 'Task' })).toBeNull();
    expect(panelResizer()).toBeNull();
    expect(shell()?.getAttribute('data-panel')).toBe('closed');
  });

  it('opens the panel docked, with its own resizer, and writes the widths as variables', () => {
    render(<Frame panel={<div>PANEL</div>} />);

    expect(screen.getByRole('complementary', { name: 'Task' })?.getAttribute('data-mode')).toBe('docked');
    expect(shell()?.getAttribute('data-panel')).toBe('docked');
    expect(panelResizer()?.getAttribute('aria-controls')).toBe('shell-panel');
    expect(shell().style.getPropertyValue('--_sidebar')).toBe('260px');
    expect(shell().style.getPropertyValue('--_panel-col')).toBe('420px');
  });

  it('puts the panel over the canvas in a narrow frame — no column for it', () => {
    setWidth(860);
    render(<Frame panel={<div>PANEL</div>} />);

    expect(screen.getByRole('complementary', { name: 'Task' })?.getAttribute('data-mode')).toBe('overlay');
    expect(shell().style.getPropertyValue('--_panel-col')).toBe('0px');
    // The overlay has its own border to drag.
    expect(panelResizer()).not.toBeNull();
  });

  it('hides the canvas scroll for screens that scroll by themselves', () => {
    render(
      <AppShell sidebar={null} header={null} canvasScroll="none">
        x
      </AppShell>,
    );

    expect(screen.getByRole('main')?.getAttribute('data-scroll')).toBe('none');
  });
});

describe('AppShell · sidebar', () => {
  it('has no sidebar resizer while the frame collapses it by itself', () => {
    render(<Frame />);
    expect(sidebarResizer()).not.toBeNull();

    setWidth(1000);
    expect(shell()?.getAttribute('data-sidebar')).toBe('auto-collapsed');
    expect(sidebarResizer()).toBeNull();
  });

  it('⌘\\ collapses the chosen sidebar and remembers it', () => {
    render(<Frame />);

    act(() => toggleSidebar());

    expect(shell()?.getAttribute('data-sidebar')).toBe('collapsed');
    expect(readPrefs().sidebarCollapsed).toBe(true);
  });

  it('peek: ⌘\\ in a narrow frame opens it over the canvas without touching the choice; Esc closes it', () => {
    setWidth(1000);
    render(<Frame />);

    act(() => toggleSidebar());

    expect(screen.getByRole('complementary', { name: 'Sidebar' })?.hasAttribute('data-peek')).toBe(true);
    expect(useShellStore.getState().prefs.sidebarCollapsed).toBe(false);

    pressEscape();
    expect(screen.getByRole('complementary', { name: 'Sidebar' })?.hasAttribute('data-peek')).toBe(false);
  });

  it('peek closes on a click outside and on navigation', () => {
    setWidth(1000);
    const { rerender } = render(<Frame scrollKey="/a" />);

    act(() => toggleSidebar());
    fireEvent.pointerDown(screen.getByText('NAV'));
    expect(useShellStore.getState().peek).toBe(true);

    fireEvent.pointerDown(screen.getByText('ROW'));
    expect(useShellStore.getState().peek).toBe(false);

    act(() => toggleSidebar());
    rerender(<Frame scrollKey="/b" />);
    expect(useShellStore.getState().peek).toBe(false);
  });

  it('peek gives focus back where it was', () => {
    setWidth(1000);
    render(<Frame />);
    screen.getByText('ROW').focus();

    act(() => toggleSidebar());
    screen.getByText('NAV').focus();
    pressEscape();

    expect(document.activeElement).toBe(screen.getByText('ROW'));
  });
});

describe('AppShell · resizing', () => {
  it('a keyboard step lives in the variables and is stored once, on key up', () => {
    render(<Frame />);
    const resizer = sidebarResizer() as HTMLElement;

    fireEvent.keyDown(resizer, { key: 'ArrowRight' });
    expect(shell().style.getPropertyValue('--_sidebar')).toBe('276px');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.keyUp(resizer, { key: 'ArrowRight' });
    expect(readPrefs().sidebarWidth).toBe(276);
    expect(resizer?.getAttribute('aria-valuenow')).toBe('276');
  });

  it('dragging the sidebar below 140 collapses it and keeps the width it had', () => {
    render(<Frame />);
    const resizer = sidebarResizer() as HTMLElement;

    fireEvent.pointerDown(resizer, { button: 0, clientX: 260 });
    moveTo(resizer, 220);
    moveTo(resizer, 100);
    expect(shell()?.getAttribute('data-sidebar')).toBe('collapsed');
    // Stored only when the gesture ends.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.pointerUp(resizer, { clientX: 100 });
    expect(readPrefs()).toMatchObject({ sidebarCollapsed: true, sidebarWidth: 260 });
  });

  it('dragging a collapsed sidebar wider than 140 opens it', () => {
    useShellStore.getState().commitPrefs({ sidebarCollapsed: true });
    render(<Frame />);
    const resizer = sidebarResizer() as HTMLElement;

    fireEvent.pointerDown(resizer, { button: 0, clientX: 48 });
    // Opened by the gesture: the width follows the pointer, not the one remembered.
    moveTo(resizer, 150);
    expect(shell().style.getPropertyValue('--_sidebar')).toBe('200px');
    moveTo(resizer, 300);
    fireEvent.pointerUp(resizer, { clientX: 300 });

    expect(shell()?.getAttribute('data-sidebar')).toBe('expanded');
    expect(readPrefs()).toMatchObject({ sidebarCollapsed: false, sidebarWidth: 300 });
  });

  it('the panel cannot squeeze the canvas below its minimum', () => {
    render(<Frame panel={<div>PANEL</div>} />);

    // 1280 − 260 − 480 = 540.
    expect(panelResizer()?.getAttribute('aria-valuemax')).toBe('540');
    fireEvent.keyDown(panelResizer() as HTMLElement, { key: 'End' });
    fireEvent.keyUp(panelResizer() as HTMLElement, { key: 'End' });
    expect(readPrefs().panelWidth).toBe(540);
  });

  it('takes the preferences another tab stored', () => {
    render(<Frame />);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, sidebarWidth: 320, sidebarCollapsed: false, panelWidth: 420 }));
    act(() => void window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY })));

    expect(shell().style.getPropertyValue('--_sidebar')).toBe('320px');
  });
});

describe('AppShell · Esc and focus', () => {
  it('Esc closes the panel; with focus inside, focus lands on the canvas', () => {
    render(<WithPanel />);
    screen.getByText('CLOSE').focus();

    pressEscape();

    expect(screen.queryByText('CLOSE')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('closing the panel from its own border also brings focus to the canvas', () => {
    render(<WithPanel />);
    (panelResizer() as HTMLElement).focus();

    pressEscape();

    expect(document.activeElement).toBe(screen.getByRole('main'));
  });

  it('opening the panel does not take focus; closing it with focus outside leaves focus alone', () => {
    render(<WithPanel />);
    pressEscape();
    screen.getByText('OPEN').focus();

    fireEvent.click(screen.getByText('OPEN'));
    expect(document.activeElement).toBe(screen.getByText('OPEN'));

    pressEscape();
    expect(document.activeElement).toBe(screen.getByText('OPEN'));
  });

  it('Esc goes down the ladder one level per press: peek, then the panel', () => {
    setWidth(1000);
    render(<WithPanel />);
    act(() => toggleSidebar());

    pressEscape();
    expect(useShellStore.getState().peek).toBe(false);
    expect(screen.getByText('CLOSE')).not.toBeNull();

    pressEscape();
    expect(screen.queryByText('CLOSE')).toBeNull();
  });

  it('without onPanelClose, Esc passes the frame by', () => {
    render(<Frame panel={<div>PANEL</div>} />);

    expect(useEscapeStore.getState().handleEscape()).toBe(false);
  });
});

describe('AppShell · canvas scroll', () => {
  it('remembers the scroll per route and restores it on return', () => {
    const { rerender } = render(<Frame scrollKey="/a" />);
    const canvas = screen.getByRole('main');

    canvas.scrollTop = 300;
    fireEvent.scroll(canvas);
    rerender(<Frame scrollKey="/b" />);
    expect(canvas.scrollTop).toBe(0);

    rerender(<Frame scrollKey="/a" />);
    expect(canvas.scrollTop).toBe(300);
  });
});

describe('AppShell · useSidebar', () => {
  const Probe: React.FC<{ name: string }> = ({ name }) => {
    const { collapsed, peek, tooltipProps } = useSidebar();

    return (
      <button type="button" {...tooltipProps({ text: name })}>
        {name}:{collapsed ? 'rail' : 'full'}
        {peek ? ':peek' : ''}
      </button>
    );
  };

  const renderProbe = () =>
    render(
      <AppShell sidebar={<Probe name="nav" />} status={<Probe name="status" />} header={<Probe name="header" />}>
        x
      </AppShell>,
    );

  it('tells the sidebar and status slots how the sidebar is drawn, and follows toggleSidebar', () => {
    renderProbe();
    expect(screen.getByText('nav:full')).not.toBeNull();
    expect(screen.getByText('status:full')).not.toBeNull();

    act(() => toggleSidebar());
    expect(screen.getByText('nav:rail')).not.toBeNull();
    expect(screen.getByText('status:rail')).not.toBeNull();
    expect(screen.getByRole('complementary', { name: 'Sidebar' }).hasAttribute('data-collapsed')).toBe(true);
  });

  it('on the rail an item gets its label as a tooltip to the right; expanded — none', () => {
    renderProbe();
    expect(screen.getByText('nav:full').hasAttribute('data-tooltip')).toBe(false);

    act(() => toggleSidebar());
    const item = screen.getByText('nav:rail');

    expect(item.getAttribute('data-tooltip')).toBe('nav');
    expect(item.getAttribute('data-tooltip-placement')).toBe('right');
  });

  it('collapsed by the window, it is a rail; a peek over the canvas is full', () => {
    setWidth(1000);
    renderProbe();
    expect(screen.getByText('nav:rail')).not.toBeNull();

    act(() => toggleSidebar());
    expect(screen.getByText('nav:full:peek')).not.toBeNull();
    expect(screen.getByRole('complementary', { name: 'Sidebar' }).hasAttribute('data-collapsed')).toBe(false);
  });

  it('outside the sidebar it reads as expanded', () => {
    renderProbe();
    act(() => toggleSidebar());

    expect(screen.getByText('header:full')).not.toBeNull();
  });
});
