import { queryClient } from '../../app/queryClient';
import type { DataChanged } from '../../app/socket';
import { CLIENT_ID } from './clientId';
import { tagsOf } from './tags';

/**
 * Signals coming this close together are one invalidation: a change touching many things sends
 * many signals, and the queries are fetched once.
 */
export const INVALIDATE_WINDOW_MS = 50;

const pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;

const flush = () => {
  timer = undefined;
  const stale = new Set(pending);
  pending.clear();

  // Marks the queries stale; the ones on screen are fetched at once, the others when next used
  void queryClient.invalidateQueries({
    predicate: (query) => tagsOf(query).some((t) => stale.has(t)),
  });
};

/** Fetches again the queries tagged with any of `tags`, in one go with the signals around it. */
export const invalidateTags = (tags: readonly string[]) => {
  tags.forEach((t) => pending.add(t));
  timer ??= setTimeout(flush, INVALIDATE_WINDOW_MS);
};

/** A `data.changed` signal. The tab whose request made the change has the new data already. */
export const receiveDataChanged = (signal: DataChanged) => {
  if (signal.origin === CLIENT_ID) return;

  invalidateTags(signal.tags);
};

/**
 * Everything of a workspace, after its channel rejoined: what was sent while the connection was
 * down is lost (there is no replay yet), so all of it may be stale.
 */
export const invalidateWorkspace = (workspaceId: string) =>
  queryClient.invalidateQueries({
    predicate: (query) => query.meta?.workspaceId === workspaceId,
  });
