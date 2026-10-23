import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@task-manager-v2/ui-kit';
import React from 'react';
import { Navigate } from 'react-router-dom';
import { inboxPath } from '../shared/constants/routes';
import { pickWorkspace, readLastWorkspaceId, workspacesQuery } from '../shared/workspaces';

/**
 * `/`: the address names no workspace, so the app opens the last one the user was in, or the
 * first of their list.
 */
export const WorkspaceEntry: React.FC = () => {
  const { data: workspaces, isError, refetch } = useQuery(workspacesQuery);

  if (isError) {
    return <ErrorState title="Couldn’t load your workspaces" onRetry={() => void refetch()} />;
  }
  // A blank moment, not a spinner: the list is one short request
  if (!workspaces) return null;

  const workspace = pickWorkspace(workspaces, readLastWorkspaceId());
  if (!workspace) {
    // TODO(workspaces): "New workspace" here, once creating one has a screen
    return (
      <EmptyState
        title="You’re not in any workspace yet"
        description="Ask someone to invite you to theirs."
      />
    );
  }

  return <Navigate to={inboxPath(workspace.slug)} replace />;
};
