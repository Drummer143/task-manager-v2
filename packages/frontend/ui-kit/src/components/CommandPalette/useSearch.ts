import { useEffect, useMemo, useState } from 'react';
import type { PaletteItem, PaletteSource } from './types';

export interface SearchGroup {
  source: PaletteSource;
  items: PaletteItem[];
}

interface Run {
  key: string;
  controller: AbortController;
  sync: Map<string, PaletteItem[]>;
  pending: Array<[string, Promise<PaletteItem[]>]>;
}

/**
 * Runs the query through the sources. What a source knows at once (its cache)
 * is on screen in the same render — the palette answers in the first frame;
 * what comes later is added when it arrives, for this query only: a changed
 * query aborts the previous run (spec: CommandPalette · search).
 */
export const useSearch = (sources: PaletteSource[], query: string, scoped: boolean, limit: number): SearchGroup[] => {
  const key = `${sources.map((source) => source.id).join('|')}\u0000${scoped}\u0000${query}`;
  const [late, setLate] = useState<{ key: string; items: Map<string, PaletteItem[]> }>({ key: '', items: new Map() });

  const run = useMemo<Run>(() => {
    const controller = new AbortController();
    const sync = new Map<string, PaletteItem[]>();
    const pending: Run['pending'] = [];

    for (const source of sources) {
      const result = source.search(query, { signal: controller.signal, scoped });

      if (Array.isArray(result)) {
        sync.set(source.id, result);
      } else {
        pending.push([source.id, result]);
      }
    }

    return { key, controller, sync, pending };
    // `key` covers the sources, the scope and the query.
  }, [key]);

  useEffect(() => {
    for (const [id, promise] of run.pending) {
      promise.then(
        (items) => {
          if (run.controller.signal.aborted) {
            return;
          }

          setLate((current) => {
            const next = new Map(current.key === run.key ? current.items : undefined);
            next.set(id, items);

            return { key: run.key, items: next };
          });
        },
        () => undefined, // A failed source shows nothing; the others still answer.
      );
    }

    return () => run.controller.abort();
  }, [run]);

  return sources
    .map((source) => ({
      source,
      items: (run.sync.get(source.id) ?? (late.key === key ? late.items.get(source.id) : undefined) ?? []).slice(0, limit),
    }))
    .filter((group) => group.items.length > 0);
};
