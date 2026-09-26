import { create } from 'zustand';
import type { PaletteCreate, PaletteSource } from './types';

/** A registered source: a box whose content the owner refreshes every render. */
export interface SourceEntry {
  current: PaletteSource;
}

interface PaletteState {
  /** In the order they were registered — the group order (context first, spec 06). */
  sources: SourceEntry[];
  create: { current: PaletteCreate } | null;
  addSource(entry: SourceEntry): () => void;
  setCreate(entry: { current: PaletteCreate } | null): void;
}

/**
 * What the palette searches: the screens register their sources while they
 * are mounted. The palette itself is a layer; the kit knows no commands.
 */
export const usePaletteStore = create<PaletteState>((set) => ({
  sources: [],
  create: null,
  addSource: (entry) => {
    set((state) => ({ sources: [...state.sources, entry] }));

    return () => set((state) => ({ sources: state.sources.filter((item) => item !== entry) }));
  },
  setCreate: (entry) => set({ create: entry }),
}));
