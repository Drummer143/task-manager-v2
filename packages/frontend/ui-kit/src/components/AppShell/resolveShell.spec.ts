import { describe, expect, it } from 'vitest';
import { BP_PANEL, BP_SIDEBAR, DEFAULT_PREFS, HYSTERESIS, clampPrefs, panelMaxFor, resolveShell, type ShellPrefs } from './resolveShell';

const prefs = (patch: Partial<ShellPrefs> = {}): ShellPrefs => ({ ...DEFAULT_PREFS, ...patch });

/** The table of spec 05 (sidebar 260, panel 420 unless said otherwise). */
describe('resolveShell · the table of spec 05', () => {
  it('≥ 1160 — the panel docks at its full width: 1280 = 260 + 600 + 420', () => {
    expect(resolveShell(1280, prefs(), true)).toEqual({
      sidebar: 'expanded',
      sidebarPx: 260,
      panel: 'docked',
      panelPx: 420,
      canvasPx: 600,
    });
  });

  it('1100–1159 — docks, squeezed to the room: 1120 = 260 + 480 + 380', () => {
    expect(resolveShell(1120, prefs(), true)).toMatchObject({ panel: 'docked', panelPx: 380, canvasPx: 480 });
  });

  it('1100 with a 420 sidebar — the panel would shrink below 360, so it goes over', () => {
    expect(resolveShell(1100, prefs({ sidebarWidth: 420 }), true)).toMatchObject({
      sidebar: 'expanded',
      panel: 'overlay',
      canvasPx: 680,
    });
  });

  it('900–1099 — the sidebar collapses by itself; the panel docks while ≥ 360: 1000 = 48 + 480 + 420, 900 = 48 + 480 + 372', () => {
    expect(resolveShell(1000, prefs(), true)).toMatchObject({ sidebar: 'auto-collapsed', sidebarPx: 48, panel: 'docked', panelPx: 420 });
    expect(resolveShell(900, prefs(), true)).toMatchObject({ panel: 'docked', panelPx: 372, canvasPx: 480 });
  });

  it('< 900 — the canvas takes the whole width, the panel is over it', () => {
    expect(resolveShell(860, prefs(), true)).toMatchObject({
      sidebar: 'auto-collapsed',
      panel: 'overlay',
      panelPx: 420,
      canvasPx: 812,
    });
  });

  it('an overlay panel leaves a 24 px gutter of the canvas', () => {
    expect(resolveShell(400, prefs(), true).panelPx).toBe(400 - 48 - 24);
  });
});

describe('resolveShell · the user’s choice', () => {
  it('keeps the chosen collapsed sidebar in a wide window', () => {
    expect(resolveShell(1280, prefs({ sidebarCollapsed: true }), false)).toEqual({
      sidebar: 'collapsed',
      sidebarPx: 48,
      panel: 'closed',
      panelPx: 0,
      canvasPx: 1232,
    });
  });

  it('never collapses the sidebar in a wide window to make room — the panel goes over instead', () => {
    expect(resolveShell(1150, prefs({ sidebarWidth: 420 }), true).sidebar).toBe('expanded');
  });

  it('never changes the preferences: narrow and widen back — all as before', () => {
    const chosen = prefs({ sidebarWidth: 300, panelWidth: 500 });
    const narrow = resolveShell(950, chosen, true);
    const wide = resolveShell(1440, chosen, true, narrow);

    expect(chosen).toEqual(prefs({ sidebarWidth: 300, panelWidth: 500 }));
    expect(wide).toMatchObject({ sidebar: 'expanded', sidebarPx: 300, panel: 'docked', panelPx: 500 });
  });
});

describe('resolveShell · hysteresis', () => {
  it('collapses at 1100 but expands again only at 1116', () => {
    const collapsed = resolveShell(BP_SIDEBAR - 1, prefs(), false);
    expect(collapsed.sidebar).toBe('auto-collapsed');

    expect(resolveShell(BP_SIDEBAR + HYSTERESIS - 1, prefs(), false, collapsed).sidebar).toBe('auto-collapsed');
    expect(resolveShell(BP_SIDEBAR + HYSTERESIS, prefs(), false, collapsed).sidebar).toBe('expanded');
    // Coming from wide, 1100 itself is still expanded.
    expect(resolveShell(BP_SIDEBAR, prefs(), false).sidebar).toBe('expanded');
  });

  it('goes over at 900 but docks again only at 916', () => {
    const over = resolveShell(BP_PANEL - 1, prefs(), true);
    expect(over.panel).toBe('overlay');

    expect(resolveShell(BP_PANEL + HYSTERESIS - 1, prefs(), true, over).panel).toBe('overlay');
    expect(resolveShell(BP_PANEL + HYSTERESIS, prefs(), true, over).panel).toBe('docked');
  });
});

describe('clampPrefs', () => {
  it('pulls widths into the limits and fills what is missing or broken with the defaults', () => {
    expect(clampPrefs({ sidebarWidth: 9000, panelWidth: 10 })).toEqual({ sidebarWidth: 420, sidebarCollapsed: false, panelWidth: 360 });
    expect(clampPrefs({ sidebarWidth: Number.NaN, sidebarCollapsed: 'yes' as unknown as boolean })).toEqual(DEFAULT_PREFS);
  });
});

describe('panelMaxFor', () => {
  it('lets a docked panel grow while the canvas keeps 480, up to 640', () => {
    expect(panelMaxFor(1280, resolveShell(1280, prefs(), true))).toBe(540);
    expect(panelMaxFor(2000, resolveShell(2000, prefs(), true))).toBe(640);
  });

  it('never below the panel minimum', () => {
    expect(panelMaxFor(700, resolveShell(700, prefs(), true))).toBeGreaterThanOrEqual(360);
  });
});
