import { useEffect, useState, useSyncExternalStore } from 'react';

/** Mounted instances per name, in mount order — the first one is the working one. */
const registry = new Map<string, symbol[]>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/**
 * For app-wide singletons (hosts that listen on the document or render one
 * overlay): tells an instance whether it is the working one. A second copy —
 * mounted by accident, e.g. by a story decorator next to the global one — stays
 * inert instead of showing a second tooltip, and warns in development. When
 * the working copy unmounts, the next one takes over.
 */
export const useSingleInstance = (name: string) => {
  const [id] = useState(() => Symbol(name));

  useEffect(() => {
    const instances = [...(registry.get(name) ?? []), id];
    registry.set(name, instances);

    if (import.meta.env.DEV && instances.length > 1) {
      console.warn(
        `${name} is mounted ${instances.length} times; only the first one works. ` +
          'Mount it once, at the root — KitRoot already does.',
      );
    }

    emit();

    return () => {
      registry.set(
        name,
        (registry.get(name) ?? []).filter((instance) => instance !== id),
      );
      emit();
    };
  }, [name, id]);

  return useSyncExternalStore(subscribe, () => registry.get(name)?.[0] === id);
};
