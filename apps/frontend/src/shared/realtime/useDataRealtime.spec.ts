import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDataRealtime } from './useDataRealtime';

const socket = vi.hoisted(() => ({
  /** What each subscription asked for, and how to stop it. */
  subscriptions: [] as {
    channelId: string;
    type: string;
    onMessage: (message: unknown) => void;
    onJoin?: () => void;
    unsubscribe: ReturnType<typeof vi.fn>;
  }[],
}));

vi.mock('../../app/socket', () => ({
  subscribeToChannel: vi.fn((options) => {
    const unsubscribe = vi.fn();
    socket.subscriptions.push({ ...options, unsubscribe });
    return unsubscribe;
  }),
}));

const invalidate = vi.hoisted(() => ({
  invalidateTags: vi.fn(),
  invalidateWorkspace: vi.fn(),
  receiveDataChanged: vi.fn(),
}));

vi.mock('./invalidate', () => invalidate);

const WS = '0192f1e0-7b1a-7c3e-9a51-3d1f0e2b4c5d';
const OTHER = '0192f1e0-7b1a-7c3e-9a51-3d1f0e2b4c5e';

const channel = (id: string) => {
  const found = socket.subscriptions.filter((s) => s.channelId === id);
  return found[found.length - 1];
};

afterEach(() => {
  socket.subscriptions.length = 0;
  vi.clearAllMocks();
});

describe('useDataRealtime', () => {
  it('listens to the user’s channel and the workspace’s for data.changed', () => {
    renderHook(() => useDataRealtime(WS));

    expect(channel('notifications').type).toBe('data.changed');
    expect(channel(`workspace:${WS}`).type).toBe('data.changed');

    const signal = { type: 'workspace.updated', tags: [`workspace:${WS}`] };
    channel(`workspace:${WS}`).onMessage(signal);
    expect(invalidate.receiveDataChanged).toHaveBeenCalledWith(signal);
  });

  it('without a workspace, listens to the user’s channel only', () => {
    renderHook(() => useDataRealtime(undefined));

    expect(socket.subscriptions.map((s) => s.channelId)).toEqual(['notifications']);
  });

  it('a rejoin of the workspace’s channel refetches its data; the first join does not', () => {
    renderHook(() => useDataRealtime(WS));
    const workspace = channel(`workspace:${WS}`);

    workspace.onJoin?.();
    expect(invalidate.invalidateWorkspace).not.toHaveBeenCalled();

    workspace.onJoin?.();
    expect(invalidate.invalidateWorkspace).toHaveBeenCalledWith(WS);
  });

  it('a rejoin of the user’s channel refetches their workspaces', () => {
    renderHook(() => useDataRealtime(WS));
    const own = channel('notifications');

    own.onJoin?.();
    own.onJoin?.();

    expect(invalidate.invalidateTags).toHaveBeenCalledTimes(1);
    expect(invalidate.invalidateTags).toHaveBeenCalledWith(['workspaces']);
  });

  it('switching workspaces leaves the old channel and keeps the user’s', () => {
    const { rerender } = renderHook(({ id }) => useDataRealtime(id), {
      initialProps: { id: WS },
    });
    const own = channel('notifications');
    const first = channel(`workspace:${WS}`);

    rerender({ id: OTHER });

    expect(first.unsubscribe).toHaveBeenCalled();
    expect(channel(`workspace:${OTHER}`)).toBeDefined();
    expect(own.unsubscribe).not.toHaveBeenCalled();
  });

  it('unmounting leaves both channels', () => {
    const { unmount } = renderHook(() => useDataRealtime(WS));

    unmount();

    expect(channel('notifications').unsubscribe).toHaveBeenCalled();
    expect(channel(`workspace:${WS}`).unsubscribe).toHaveBeenCalled();
  });
});
