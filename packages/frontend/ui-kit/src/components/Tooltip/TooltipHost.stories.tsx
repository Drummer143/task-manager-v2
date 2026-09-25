import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useCallback, useEffect, useState } from 'react';
import TooltipHost from './TooltipHost';
import { tooltipProps } from './tooltipProps';
import { Surface } from '../Surface';
import { cssVar, raw } from '../../tokens';
import { useEscapeStack } from '../../interaction/escape';

/*
 * Test bench for the tooltip host. The one <TooltipHost /> comes from KitRoot
 * (the global decorator in .storybook/preview.tsx) — never mount a second one; every trigger below is a plain element with tooltipProps()
 * attributes — no tooltip component per trigger. Each story says what to check.
 *
 * Button / IconButton do not exist yet, so they are mocked here. The mocks put
 * the accessible name on the trigger itself (aria-label, aria-keyshortcuts):
 * the tooltip is visual only.
 */

const page: CSSProperties = {
  display: 'grid',
  gap: cssVar('sp-6'),
  padding: cssVar('sp-7'),
  fontSize: cssVar('type-body'),
  color: cssVar('text-primary'),
};

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: cssVar('sp-3') };

const toolbar: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: cssVar('sp-1'),
  padding: cssVar('sp-2'),
  border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  borderRadius: cssVar('radius-md'),
  background: cssVar('bg-raised'),
};

const iconButton: CSSProperties = {
  display: 'inline-grid',
  placeItems: 'center',
  width: cssVar('control-height'),
  height: cssVar('control-height'),
  padding: 0,
  border: 0,
  borderRadius: cssVar('radius-sm'),
  background: 'transparent',
  color: cssVar('text-secondary'),
  fontSize: cssVar('type-body'),
  cursor: 'pointer',
};

const textButton: CSSProperties = {
  ...iconButton,
  width: 'auto',
  padding: `0 ${cssVar('sp-4')}`,
  border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
  color: cssVar('text-primary'),
};

function Check({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, maxWidth: cssVar('palette-width'), color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>
      {children}
    </p>
  );
}

function Icon({ label, glyph, keys, reason }: { label: string; glyph: string; keys?: string; reason?: string }) {
  const button = (
    <button
      type="button"
      style={{ ...iconButton, ...(reason ? { opacity: 0.45, cursor: 'default' } : null) }}
      aria-label={label}
      aria-keyshortcuts={keys}
      disabled={Boolean(reason)}
      {...(reason ? {} : tooltipProps({ text: label, keys }))}
    >
      <span aria-hidden="true">{glyph}</span>
    </button>
  );

  return reason ? (
    <span tabIndex={0} style={{ display: 'inline-flex' }} {...tooltipProps({ text: label, reason, keys })}>
      {button}
    </span>
  ) : (
    button
  );
}

function TaskToolbar() {
  return (
    <div style={toolbar} role="toolbar" aria-label="Task actions">
      <Icon label="Create task" glyph="＋" keys="c" />
      <Icon label="Status" glyph="◐" keys="s" />
      <Icon label="Assignee" glyph="☺" keys="a" />
      <Icon label="Due date" glyph="▦" keys="d" />
      <Icon label="Copy link" glyph="⧉" keys="mod+shift+c" />
      <Icon label="Archive" glyph="▣" reason="Unavailable: no access to this board" />
    </div>
  );
}

const meta: Meta<typeof TooltipHost> = {
  title: 'Primitives/Tooltip',
  component: TooltipHost,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof TooltipHost>;

export const Default: Story = {
  render: () => (
    <div style={page}>
      <Check>
        Hover each item. Caption only · caption + hotkey (Kbd inside the tooltip) · reason on the disabled
        button · exact time on the relative date. Each first tooltip appears after {raw['tooltip-delay']} ms.
      </Check>

      <div style={row}>
        <Icon label="Add task" glyph="＋" />
        <button type="button" style={textButton} aria-keyshortcuts="c" {...tooltipProps({ text: 'Create task', keys: 'c' })}>
          Create task
        </button>
        <Icon label="Delete page" glyph="✕" reason="Unavailable: no access to this board" />
        <time dateTime="2026-09-23T14:32" {...tooltipProps({ text: 'September 23, 2026, 14:32' })}>
          2 h ago
        </time>
      </div>
    </div>
  ),
};

export const ToolbarGroup: Story = {
  render: () => (
    <div style={page}>
      <Check>
        Hover the first button and wait for the tooltip. Slide right: every next tooltip appears with no delay.
        Leave the toolbar for longer than 300 ms, come back — the delay is back.
      </Check>
      <TaskToolbar />
    </div>
  ),
};

export const Keyboard: Story = {
  render: () => (
    <div style={page}>
      <Check>
        Click into the page, then Tab through the toolbar: each tooltip appears instantly, exactly when the focus
        ring appears. Moving the mouse around does not hide or replace a keyboard tooltip. Clicking a button with the
        mouse shows no tooltip and hides a hover one — it does not come back until the pointer leaves the button.
        Tab onto the disabled item: its reason is shown.
      </Check>
      <div style={row}>
        <button type="button" style={textButton}>
          Before
        </button>
        <TaskToolbar />
        <button type="button" style={textButton}>
          After
        </button>
      </div>
    </div>
  ),
};

/** Placement near the viewport edges: flips from top to bottom, shifts sideways, never clips. */
export const Edges: Story = {
  render: () => {
    const corner = (position: CSSProperties, label: string) => (
      <div style={{ position: 'absolute', ...position }}>
        <Icon label={label} glyph="●" keys="?" />
      </div>
    );

    return (
      <div style={{ position: 'relative', height: '100vh' }}>
        {corner({ top: 0, left: 0 }, 'Top left — flips below, shifts right')}
        {corner({ top: 0, left: '50%' }, 'Top center — flips below')}
        {corner({ top: 0, right: 0 }, 'Top right — flips below, shifts left')}
        {corner({ bottom: 0, left: 0 }, 'Bottom left — stays above, shifts right')}
        {corner({ bottom: 0, right: 0 }, 'Bottom right — stays above, shifts left')}
        <div style={{ position: 'absolute', top: '40%', left: 0, right: 0, display: 'grid', justifyItems: 'center' }}>
          <Check>Hover the dots in the corners: the tooltip never leaves the window and keeps its offset from the trigger.</Check>
        </div>
      </div>
    );
  },
};

export const Positions: Story = {
  render: () => (
    <div style={{ ...page, justifyItems: 'center', paddingBlock: cssVar('sp-8') }}>
      <Check>Each button asks for its own side. The offset from the trigger is the same on every side.</Check>
      <div style={row}>
        {(['top', 'bottom', 'left', 'right'] as const).map((placement) => (
          <button key={placement} type="button" style={textButton} {...tooltipProps({ text: `Placed ${placement}`, placement })}>
            {placement}
          </button>
        ))}
      </div>
    </div>
  ),
};

export const LongText: Story = {
  render: () => (
    <div style={page}>
      <Check>The first tooltip fits one line. The second wraps at the max width onto a second line — and no further.</Check>
      <div style={row}>
        <Icon label="Short caption" glyph="A" />
        <Icon label="Unavailable: this board is archived, restore it from the page tree first" glyph="B" />
      </div>
    </div>
  ),
};

export const OnInverseSurface: Story = {
  render: () => (
    <div style={page}>
      <Check>Over the light canvas the tooltip is dark; over the dark selection bar it is light. Kbd inside follows.</Check>
      <TaskToolbar />
      <Surface
        tone="inverse"
        style={{ ...toolbar, border: 0, background: undefined, justifySelf: 'start' }}
        role="toolbar"
        aria-label="Selection"
      >
        <span style={{ padding: `0 ${cssVar('sp-3')}`, fontSize: cssVar('type-meta') }}>Selected: 2</span>
        <Icon label="Status" glyph="◐" keys="s" />
        <Icon label="Move to Done" glyph="✓" keys="mod+right" />
        <Icon label="Clear selection" glyph="✕" keys="esc" />
      </Surface>
    </div>
  ),
};

/** Scrolling hides the tooltip (it is not tracked while the page moves). */
export const Scroll: Story = {
  render: () => (
    <div style={page}>
      <Check>Hover a row until its tooltip shows, then scroll the list with the wheel: the tooltip hides at once.</Check>
      <div
        style={{
          height: cssVar('panel-width'),
          width: cssVar('column-width'),
          overflow: 'auto',
          border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
          borderRadius: cssVar('radius-sm'),
        }}
      >
        {Array.from({ length: 40 }, (_, index) => (
          <div
            key={index}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: cssVar('row-height'), padding: `0 ${cssVar('sp-3')}` }}
          >
            Task {index + 1}
            <Icon label="Open task" glyph="↗" keys="enter" />
          </div>
        ))}
      </div>
    </div>
  ),
};

export const EscapeLadder: Story = {
  render: () => {
    const [panelOpen, setPanelOpen] = useState(true);
    const closePanel = useCallback(() => {
      setPanelOpen(false);
      return true;
    }, []);

    useEscapeStack(closePanel, panelOpen);

    return (
      <div style={page}>
        <Check>
          Show a tooltip (hover or Tab), press Esc once: the tooltip hides AND the panel closes with the same press.
          If the panel needs a second Esc, the tooltip is swallowing the key.
        </Check>
        <TaskToolbar />
        <div style={row}>
          <span>Panel: {panelOpen ? 'open' : 'closed'}</span>
          <button type="button" style={textButton} onClick={() => setPanelOpen(true)}>
            Reopen panel
          </button>
        </div>
      </div>
    );
  },
};

/** No trigger tooltips over an open menu: the trigger with aria-expanded="true" stays silent. */
export const OpenMenu: Story = {
  render: () => {
    const [open, setOpen] = useState(false);

    return (
      <div style={page}>
        <Check>
          Hover the trigger: tooltip. Click it to "open the menu" (aria-expanded turns true): hovering it again shows
          nothing until the menu is closed.
        </Check>
        <div style={{ position: 'relative', justifySelf: 'start' }}>
          <button
            type="button"
            style={textButton}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            {...tooltipProps({ text: 'Task actions', keys: 'mod+k' })}
          >
            Actions ▾
          </button>
          {open && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                top: `calc(100% + ${cssVar('sp-2')})`,
                left: 0,
                width: cssVar('column-width'),
                padding: cssVar('sp-2'),
                border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
                borderRadius: cssVar('radius-sm'),
                background: cssVar('bg-raised'),
                boxShadow: cssVar('shadow-overlay'),
              }}
            >
              <div role="menuitem" style={{ height: cssVar('control-height'), display: 'flex', alignItems: 'center', padding: `0 ${cssVar('sp-3')}` }}>
                Duplicate
              </div>
            </div>
          )}
        </div>
      </div>
    );
  },
};

/** The trigger disappears while its tooltip is shown (a row got deleted): the tooltip must not hang in the air. */
export const TriggerRemoved: Story = {
  render: () => {
    const [present, setPresent] = useState(true);

    useEffect(() => {
      if (present) return;
      const timer = setTimeout(() => setPresent(true), 3000);
      return () => clearTimeout(timer);
    }, [present]);

    return (
      <div style={page}>
        <Check>
          Hover the button and keep the pointer still: after the tooltip shows, the button removes itself 1 s later.
          The tooltip must disappear with it. The button comes back after 3 s.
        </Check>
        <div style={{ ...row, minHeight: cssVar('control-height') }}>
          {present ? (
            <button
              type="button"
              style={textButton}
              onPointerEnter={() => setTimeout(() => setPresent(false), raw['tooltip-delay'] + 1000)}
              {...tooltipProps({ text: 'This row will be deleted' })}
            >
              Hover me
            </button>
          ) : (
            <span style={{ color: cssVar('text-muted') }}>Removed…</span>
          )}
        </div>
      </div>
    );
  },
};

/** Touch never shows tooltips. Check with DevTools device mode (Ctrl+Shift+M) and tap the buttons. */
export const Touch: Story = {
  render: () => (
    <div style={page}>
      <Check>
        Turn on device emulation in DevTools and tap the buttons: no tooltip ever appears. Back to the mouse: tooltips
        work again.
      </Check>
      <TaskToolbar />
    </div>
  ),
};

/**
 * A long card title is clamped to two lines; its full text is the tooltip.
 * The icon button inside the card has its own tooltip — the innermost trigger wins.
 */
export const TruncatedTitle: Story = {
  render: () => {
    const card = (title: string) => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: cssVar('sp-3'),
          width: cssVar('column-width'),
          padding: cssVar('card-padding'),
          border: `${cssVar('border-width')} solid ${cssVar('border-hairline')}`,
          borderRadius: cssVar('radius-sm'),
          background: cssVar('bg-raised'),
        }}
      >
        <span
          style={{
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: cssVar('line-clamp-title'),
            overflow: 'hidden',
          }}
          {...tooltipProps({ overflow: true })}
        >
          {title}
        </span>
        <Icon label="Open task" glyph="↗" keys="enter" />
      </div>
    );

    return (
      <div style={page}>
        <Check>
          Hover the long title: its full text shows. Hover the short title: nothing — it fits, so there is nothing to
          reveal. Hover the icon inside the same card: the icon's own tooltip wins.
        </Check>
        <div style={row}>
          {card('Move the token layer into a separate package and load it first in every app that uses the kit')}
          {card('Hotkey registry')}
        </div>
      </div>
    );
  },
};

/** Density does not change the tooltip — it is meta text, not a control. */
export const Densities: Story = {
  render: () => (
    <div style={page}>
      <Check>The toolbar changes height with density; the tooltip looks the same in all three.</Check>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ display: 'grid', gap: cssVar('sp-2'), justifyItems: 'start' }}>
          <span style={{ color: cssVar('text-muted'), fontSize: cssVar('type-meta') }}>{density}</span>
          <TaskToolbar />
        </div>
      ))}
    </div>
  ),
};
