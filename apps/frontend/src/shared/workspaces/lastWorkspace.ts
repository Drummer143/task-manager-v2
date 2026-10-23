import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';

const KEY = 'verso:workspace';

/** The workspace the user was in last, by id: a slug changes, the id does not. */
export const readLastWorkspaceId = (): string | null => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    // Storage may be off (a private window, blocked site data): no memory, the first one opens
    return null;
  }
};

export const rememberWorkspace = (workspaceId: string) => {
  try {
    localStorage.setItem(KEY, workspaceId);
  } catch {
    // As above: nothing to remember it in
  }
};

/**
 * Where the app opens when the address names no workspace: the last one, while the user is
 * still in it; else — the first sign-in, or another device — their personal one; else the first
 * of the list. A deleted one (its owner still sees it for 30 days) is never opened by itself.
 */
export const pickWorkspace = (
  workspaces: readonly WorkspaceWithRoles[],
  lastId: string | null,
): WorkspaceWithRoles | undefined => {
  const live = workspaces.filter((workspace) => !workspace.deletedAt);

  return (
    live.find((workspace) => workspace.id === lastId) ??
    live.find((workspace) => workspace.isPersonal) ??
    live[0]
  );
};
