import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import React, { createContext, useContext } from 'react';

const WorkspaceContext = createContext<WorkspaceWithRoles | null>(null);

export interface WorkspaceProviderProps {
  workspace: WorkspaceWithRoles;
  children: React.ReactNode;
}

/** The workspace of the address, resolved: everything inside the layout works by its id. */
export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ workspace, children }) => (
  <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
);

/**
 * The current workspace. Only inside the layout: it renders the pages once the slug of the
 * address is resolved, so a page never sees a workspace that is not there yet.
 */
export const useWorkspace = (): WorkspaceWithRoles => {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error('useWorkspace is for the pages of a workspace, inside its layout');

  return workspace;
};
