import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickWorkspace, readLastWorkspaceId, rememberWorkspace } from './lastWorkspace';

const workspace = (id: string, deletedAt?: string, isPersonal = false): WorkspaceWithRoles => ({
  id,
  slug: id,
  name: id,
  taskPrefix: 'VT',
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  deletedAt,
  isOwner: true,
  isPersonal,
  roles: [],
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pickWorkspace', () => {
  const list = [workspace('a'), workspace('b'), workspace('c')];

  it('the last one, while the user is still in it', () => {
    expect(pickWorkspace(list, 'b')?.id).toBe('b');
  });

  it('else their personal one: the first sign-in, another device', () => {
    const withPersonal = [workspace('a'), workspace('mine', undefined, true), workspace('c')];

    expect(pickWorkspace(withPersonal, null)?.id).toBe('mine');
    expect(pickWorkspace(withPersonal, 'gone')?.id).toBe('mine');
    expect(pickWorkspace(withPersonal, 'c')?.id).toBe('c');
  });

  it('else the first of the list', () => {
    expect(pickWorkspace(list, 'gone')?.id).toBe('a');
    expect(pickWorkspace(list, null)?.id).toBe('a');
  });

  it('never a deleted one, even the last', () => {
    const withDeleted = [workspace('a', '2026-10-17T00:00:00Z'), workspace('b')];

    expect(pickWorkspace(withDeleted, 'a')?.id).toBe('b');
    expect(pickWorkspace([workspace('a', '2026-10-17T00:00:00Z')], null)).toBeUndefined();
  });
});

describe('the last workspace', () => {
  it('is kept between visits', () => {
    rememberWorkspace('w2');

    expect(readLastWorkspaceId()).toBe('w2');
  });

  it('without storage, there is none, and nothing breaks', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => rememberWorkspace('w2')).not.toThrow();
    expect(readLastWorkspaceId()).toBeNull();
  });
});
