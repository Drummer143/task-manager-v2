import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './TooltipHost.module.scss';
import { raw } from '../../tokens';
import { Kbd } from '../Kbd';
import { oppositeSurface, Surface, type SurfaceTone } from '../Surface';
import { TOOLTIP_ID, TOOLTIP_KEYS_ID, TRIGGER_SELECTOR, WATCHED_ATTRIBUTES } from './constants';
import { isKeyboardFocus } from './isKeyboardFocus';
import { placeTooltip } from './placeTooltip';
import { readTrigger } from './readTrigger';
import { useSingleInstance } from '../../hooks/useSingleInstance';
import { isUnderLayer } from '../../interaction/layers/constants';
import type { TooltipContent } from './types';

type Source = 'hover' | 'focus';

interface View extends TooltipContent {
  trigger: Element;
  tone: SurfaceTone;
}

const closestTrigger = (target: EventTarget | null) =>
  target instanceof Element ? target.closest(TRIGGER_SELECTOR) : null;

/** Surfaces set `data-surface` on the DOM, so the tone is readable without React context. */
const surfaceOf = (element: Element): SurfaceTone =>
  element.closest('[data-surface]')?.getAttribute('data-surface') === 'inverse' ? 'inverse' : 'default';

/**
 * Silent: an open menu's own trigger, and every trigger under an open layer —
 * inside the layer tooltips work (spec 10).
 */
const isSilenced = (trigger: Element) =>
  trigger.getAttribute('aria-expanded') === 'true' || isUnderLayer(trigger);

/**
 * What of the tooltip describes the trigger. A label that only repeats the
 * trigger's name (IconButton: tooltip = aria-label) is not read twice — then
 * only the hotkey is its description; a reason or any other text is, whole.
 */
const descriptionFor = (trigger: Element, content: TooltipContent) => {
  if (content.isReason) {
    return TOOLTIP_ID;
  }

  const name = (trigger.getAttribute('aria-label') ?? trigger.textContent ?? '').trim();

  if (content.text !== name) {
    return TOOLTIP_ID;
  }

  return content.keys ? TOOLTIP_KEYS_ID : null;
};

const DESCRIBED_BY = 'aria-describedby';

/** Adds or removes one id in aria-describedby, keeping the trigger's own ones. */
const toggleDescription = (trigger: Element, id: string, on: boolean) => {
  const ids = (trigger.getAttribute(DESCRIBED_BY) ?? '').split(/\s+/).filter((item) => item && item !== id);

  if (on) {
    ids.push(id);
  }

  if (ids.length > 0) {
    trigger.setAttribute(DESCRIBED_BY, ids.join(' '));
  } else {
    trigger.removeAttribute(DESCRIBED_BY);
  }
};

/**
 * The single tooltip of the app. Mount once, near the root. Triggers are plain
 * elements with `tooltipProps()` attributes — no component, hook or listener
 * per trigger; this host listens on the document and shows one element.
 *
 * The tooltip is `role="tooltip"` with a stable id: while shown, the trigger's
 * aria-describedby points at it (or only at its hotkey), and drops it on hide.
 */
export const TooltipHost: React.FC = () => {
  const [view, setView] = useState<View | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  // A second host (a story decorator next to the global one) stays inert.
  const primary = useSingleInstance('TooltipHost');

  useEffect(() => {
    if (!primary) {
      return;
    }

    /** What is shown (or waiting for its delay) and why. */
    let active: { trigger: Element; source: Source } | null = null;
    let visible = false;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    /** When the last visible tooltip hid — for the toolbar group window. */
    let lastHiddenAt = Number.NEGATIVE_INFINITY;
    /** Pressed trigger: no tooltip again until the pointer leaves it (spec). */
    let suppressed: Element | null = null;
    /** The trigger whose aria-describedby currently points at the tooltip. */
    let described: { trigger: Element; id: string } | null = null;

    const describe = (trigger: Element, content: TooltipContent) => {
      undescribe();

      const id = descriptionFor(trigger, content);

      if (id) {
        toggleDescription(trigger, id, true);
        described = { trigger, id };
      }
    };

    const undescribe = () => {
      if (described) {
        toggleDescription(described.trigger, described.id, false);
        described = null;
      }
    };

    const observer = new MutationObserver((records) => {
      if (!active) {
        return;
      }

      const { trigger } = active;

      // A row, column or panel can be removed at any level; asking once per
      // batch is enough — no need to walk hundreds of records of a list update.
      if (!trigger.isConnected || isSilenced(trigger)) {
        hide();
        return;
      }

      if (visible && records.some((record) => record.type === 'attributes')) {
        const content = readTrigger(trigger);

        if (content) {
          describe(trigger, content);
          setView((current) => (current ? { ...current, ...content } : current));
        } else {
          hide();
        }
      }
    });

    const show = (trigger: Element, source: Source) => {
      clearTimeout(showTimer);

      const content = trigger.isConnected && !isSilenced(trigger) ? readTrigger(trigger) : null;

      if (!content) {
        hide();
        return;
      }

      active = { trigger, source };
      visible = true;

      observer.disconnect();
      // Watch the whole document only while a tooltip is on screen.
      observer.observe(document.body, { childList: true, subtree: true });
      observer.observe(trigger, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });

      describe(trigger, content);
      setView({ ...content, trigger, tone: oppositeSurface(surfaceOf(trigger)) });
    };

    const hide = () => {
      clearTimeout(showTimer);
      observer.disconnect();
      undescribe();

      if (visible) {
        lastHiddenAt = performance.now();
      }

      if (active || visible) {
        active = null;
        visible = false;
        setView(null);
      }
    };

    const scheduleHover = (trigger: Element) => {
      const content = readTrigger(trigger);

      if (!content || isSilenced(trigger)) {
        return;
      }

      clearTimeout(showTimer);
      active = { trigger, source: 'hover' };

      // Sliding along a toolbar: right after another tooltip, show at once.
      const withinGroup = visible || performance.now() - lastHiddenAt < raw['tooltip-group-window'];

      if (withinGroup) {
        show(trigger, 'hover');
      } else {
        showTimer = setTimeout(() => show(trigger, 'hover'), content.delay);
      }
    };

    const handlePointerOver = (event: PointerEvent) => {
      // Never on touch or pen (spec).
      if (event.pointerType !== 'mouse') {
        return;
      }

      const trigger = closestTrigger(event.target);

      if (!trigger || trigger === suppressed) {
        return;
      }

      // A keyboard tooltip is not stolen by a pointer passing by.
      if (active?.source === 'focus') {
        return;
      }

      // Moving between the children of the same trigger.
      if (trigger === active?.trigger) {
        return;
      }

      scheduleHover(trigger);
    };

    const handlePointerOut = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') {
        return;
      }

      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;

      if (suppressed && !(next && suppressed.contains(next))) {
        suppressed = null;
      }

      if (active?.source !== 'hover') {
        return;
      }

      // Still inside the trigger — onto its icon or label.
      if (next && active.trigger.contains(next)) {
        return;
      }

      hide();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const trigger = closestTrigger(event.target);

      // Pointer focus (a click) shows nothing — the hover path owns the mouse.
      if (!trigger || !(event.target instanceof Element) || !isKeyboardFocus(event.target)) {
        return;
      }

      show(trigger, 'focus'); // instantly: no delay, no group window
    };

    const handleFocusOut = (event: FocusEvent) => {
      if (active?.source !== 'focus') {
        return;
      }

      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;

      if (next && active.trigger.contains(next)) {
        return;
      }

      hide();
    };

    const handlePointerDown = (event: PointerEvent) => {
      suppressed = closestTrigger(event.target);
      hide();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // Passive on purpose: a tooltip is not a level of the Esc ladder, so the
      // same press still closes the panel / clears the selection underneath.
      if (event.key === 'Escape') {
        hide();
      }
    };

    // Not tracked while the page moves — hidden instead (spec).
    const handleViewportChange = () => {
      if (active) {
        hide();
      }
    };

    const capture = { capture: true } as const;
    const passiveCapture = { capture: true, passive: true } as const;

    document.addEventListener('pointerover', handlePointerOver, capture);
    document.addEventListener('pointerout', handlePointerOut, capture);
    document.addEventListener('focusin', handleFocusIn, capture);
    document.addEventListener('focusout', handleFocusOut, capture);
    document.addEventListener('pointerdown', handlePointerDown, capture);
    document.addEventListener('keydown', handleKeyDown, capture);
    document.addEventListener('scroll', handleViewportChange, passiveCapture);
    window.addEventListener('resize', handleViewportChange, { passive: true });

    return () => {
      clearTimeout(showTimer);
      observer.disconnect();
      undescribe();

      document.removeEventListener('pointerover', handlePointerOver, capture);
      document.removeEventListener('pointerout', handlePointerOut, capture);
      document.removeEventListener('focusin', handleFocusIn, capture);
      document.removeEventListener('focusout', handleFocusOut, capture);
      document.removeEventListener('pointerdown', handlePointerDown, capture);
      document.removeEventListener('keydown', handleKeyDown, capture);
      document.removeEventListener('scroll', handleViewportChange, passiveCapture);
      window.removeEventListener('resize', handleViewportChange);
      setView(null);
    };
  }, [primary]);

  // Before paint: two reads (trigger rect, tooltip size), then one write.
  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;

    if (!view || !tooltip) {
      return;
    }

    const { x, y, placement } = placeTooltip(
      view.trigger.getBoundingClientRect(),
      // Layout size ignores transforms — stable even under an appear animation.
      { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
      view.placement,
      raw['tooltip-offset'],
      raw['overlay-margin'],
    );

    // transform, not left/top: the box stays at 0,0, so its width never shrinks
    // near the right edge and the measurement above stays true.
    tooltip.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    tooltip.dataset.placement = placement;
  }, [view]);

  if (!primary || !view) {
    return null;
  }

  return createPortal(
    <Surface tone={view.tone} ref={tooltipRef} className={styles.root} id={TOOLTIP_ID} role="tooltip">
      <span className={styles.text}>{view.text}</span>
      {view.keys && <Kbd id={TOOLTIP_KEYS_ID} keys={view.keys} />}
    </Surface>,
    document.body,
  );
};

export default TooltipHost;
