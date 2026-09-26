import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { useLayerStore } from '../../interaction/layers';
import { matchKeys } from '../Kbd';
import { CommandPalette } from './CommandPalette';
import { usePaletteStore, type SourceEntry } from './store';
import type { PaletteCreate, PaletteSource } from './types';

/**
 * Registers a group of the palette while the calling screen is mounted. The
 * latest `source` is always used — no need to memoize it; registration itself
 * happens once, so a re-render does not re-order the groups.
 */
export const usePaletteSource = (source: PaletteSource) => {
  const entry = useRef<SourceEntry>({ current: source });

  useLayoutEffect(() => {
    entry.current.current = source;
  });

  useEffect(() => usePaletteStore.getState().addSource(entry.current), []);
};

/** The "Create …" rows for a query nothing matched, or any query (spec 06). One per app. */
export const usePaletteCreate = (create: PaletteCreate) => {
  const entry = useRef({ current: create });

  useLayoutEffect(() => {
    entry.current.current = create;
  });

  useEffect(() => {
    usePaletteStore.getState().setCreate(entry.current);

    return () => {
      if (usePaletteStore.getState().create === entry.current) {
        usePaletteStore.getState().setCreate(null);
      }
    };
  }, []);
};

const isPaletteOpen = () => {
  const layer = useLayerStore.getState().layer;

  return typeof layer === 'object' && layer !== null && 'type' in layer && layer.type === CommandPalette;
};

/** Open, close, toggle — the palette is the app's single layer while open (a second layer replaces it). */
export const palette = {
  open: () => {
    if (!isPaletteOpen()) {
      useLayerStore.getState().openLayer(createElement(CommandPalette));
    }
  },
  close: () => {
    if (isPaletteOpen()) {
      useLayerStore.getState().closeLayer();
    }
  },
  toggle: () => (isPaletteOpen() ? palette.close() : palette.open()),
  isOpen: isPaletteOpen,
};

/** Whether the palette is on screen, as React state. */
export const usePaletteOpen = () =>
  useLayerStore((state) => {
    const layer = state.layer;

    return typeof layer === 'object' && layer !== null && 'type' in layer && layer.type === CommandPalette;
  });

export const PALETTE_KEYS = 'mod+k';

/**
 * ⌘K / Ctrl+K opens the palette on any screen — also from a text field,
 * where one-letter hotkeys sleep — and closes it when pressed again (spec 06).
 * KitRoot listens once for the whole app.
 */
export const useListenPalette = () => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !matchKeys(PALETTE_KEYS, event)) {
        return;
      }

      event.preventDefault();
      palette.toggle();
    };

    // Capture: before a focused field or an open menu can take the keys.
    window.addEventListener('keydown', handleKeyDown, true);

    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);
};
