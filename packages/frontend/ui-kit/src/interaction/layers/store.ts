import { create } from 'zustand';
import type { ReactNode } from 'react';

/**
 * The overlay host state (spec 07): at most one layer at a time — palette,
 * cheatsheet, confirmation. Opening a second one replaces the first. Focus
 * returns to whoever opened the layer when it finally closes.
 */
export interface LayerState {
  layer: ReactNode | null;
  openedBy: HTMLElement | null;
  openLayer: (content: ReactNode) => void;
  closeLayer: () => void;
}

export const useLayerStore = create<LayerState>((set, get) => ({
  layer: null,
  openedBy: null,

  openLayer: (content) => {
    // Remember the opener only on the first open; a replacing layer keeps it.
    const openedBy =
      get().layer === null ? (document.activeElement as HTMLElement | null) : get().openedBy;

    set({ layer: content, openedBy });
  },

  closeLayer: () => {
    const { openedBy } = get();

    set({ layer: null, openedBy: null });
    openedBy?.focus?.();
  },
}));
