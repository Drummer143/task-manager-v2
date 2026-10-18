import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../app/queryClient';
import { CLIENT_ID } from './clientId';
import {
  INVALIDATE_WINDOW_MS,
  invalidateTags,
  invalidateWorkspace,
  receiveDataChanged,
} from './invalidate';
import { type Tag, tag } from './tags';

const WS = '0192f1e0-7b1a-7c3e-9a51-3d1f0e2b4c5d';
const OTHER = '0192f1e0-7b1a-7c3e-9a51-3d1f0e2b4c5e';

/** A cached query with these tags, as `useQuery({ meta: { tags, workspaceId } })` leaves it. */
const cached = (key: string, tags: readonly Tag[], workspaceId?: string) => {
  const query = queryClient.getQueryCache().build(queryClient, {
    queryKey: [key],
    meta: { tags, workspaceId },
  });
  query.setData('data');
  return query;
};

const stale = () =>
  queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => query.queryKey[0]);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  queryClient.clear();
  vi.restoreAllMocks();
});

describe('invalidateTags', () => {
  it('marks stale only the queries carrying a named tag', () => {
    cached('workspace', [tag.workspace(WS)]);
    cached('other', [tag.workspace(OTHER)]);
    cached('untagged', []);

    invalidateTags([tag.workspace(WS)]);
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(stale()).toEqual(['workspace']);
  });

  it('waits a moment and invalidates the signals around it at once', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    cached('workspace', [tag.workspace(WS)]);
    cached('list', [tag.workspaces()]);

    invalidateTags([tag.workspace(WS)]);
    invalidateTags([tag.workspaces()]);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(stale().sort()).toEqual(['list', 'workspace']);
  });

  it('starts a new batch after one is flushed', () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    invalidateTags([tag.workspaces()]);
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);
    invalidateTags([tag.workspaces()]);
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});

describe('receiveDataChanged', () => {
  it('invalidates the tags of a signal from elsewhere', () => {
    cached('workspace', [tag.workspace(WS)]);

    receiveDataChanged({ type: 'workspace.updated', tags: [tag.workspace(WS)], origin: 'another-tab' });
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(stale()).toEqual(['workspace']);
  });

  it('skips the echo of this tab’s own request', () => {
    cached('workspace', [tag.workspace(WS)]);

    receiveDataChanged({ type: 'workspace.updated', tags: [tag.workspace(WS)], origin: CLIENT_ID });
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(stale()).toEqual([]);
  });

  it('takes a signal without an origin as from elsewhere', () => {
    cached('workspace', [tag.workspace(WS)]);

    receiveDataChanged({ type: 'workspace.updated', tags: [tag.workspace(WS)] });
    vi.advanceTimersByTime(INVALIDATE_WINDOW_MS);

    expect(stale()).toEqual(['workspace']);
  });
});

describe('invalidateWorkspace', () => {
  it('marks stale every query of that workspace, whatever its tags, and nothing else', async () => {
    cached('workspace', [tag.workspace(WS)], WS);
    cached('untagged', [], WS);
    cached('other', [tag.workspace(OTHER)], OTHER);
    cached('list', [tag.workspaces()]);

    await invalidateWorkspace(WS);

    expect(stale().sort()).toEqual(['untagged', 'workspace']);
  });
});
