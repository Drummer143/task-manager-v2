import { useCursorStore } from '@task-manager-v2/ui-kit';

/**
 * Where the highlight goes when the row `id` leaves the list: the next row, the previous one if
 * it was the last, nothing if it was the only one (spec: Inbox · 05).
 */
export const neighbourOf = <Row extends { id: string }>(list: readonly Row[], id: string): Row | undefined => {
  const index = list.findIndex((row) => row.id === id);

  return index === -1 ? undefined : (list[index + 1] ?? list[index - 1]);
};

/**
 * Call before a row leaves the list (archive, unarchive): if it is the highlighted one, the
 * highlight steps to its neighbour first. Otherwise the list finds its cursor gone and puts it
 * back on the first row — the user loses their place.
 */
export const stepCursorOff = <Row extends { id: string }>(list: readonly Row[], id: string) => {
  const { cursor, setCursor } = useCursorStore.getState();

  if (cursor === id) {
    setCursor(neighbourOf(list, id)?.id ?? null);
  }
};
