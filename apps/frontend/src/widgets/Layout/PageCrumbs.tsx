import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@task-manager-v2/ui-kit';
import type { WorkspaceWithRoles } from '@task-manager-v2/api/main/schemas';
import { pagePath } from '../../shared/constants/routes';
import { pageTreeQuery, pathTo, titleOf } from '../../shared/pages';
import styles from './PageCrumbs.module.scss';

export interface PageCrumbsProps {
  workspace: WorkspaceWithRoles;
  shortId: string;
}

/**
 * Where the open page is, in the canvas header: the workspace, its ancestors as links, then the
 * page. From the tree, so a rename shows here at once. A plain trail until the kit has its
 * Breadcrumbs (spec: [UI-kit] Breadcrumbs): no collapsing of long paths yet.
 */
export const PageCrumbs: React.FC<PageCrumbsProps> = ({ workspace, shortId }) => {
  const { data: pages = [] } = useQuery(pageTreeQuery(workspace.id));
  const page = pages.find((each) => each.shortId === shortId);
  const path = page ? pathTo(pages, page.id) : [];

  return (
    <nav aria-label="Breadcrumbs" className={styles.crumbs}>
      <ol className={styles.list}>
        <li className={styles.item}>{workspace.name}</li>
        {path.map((each, index) => (
          <li key={each.id} className={styles.item}>
            {index === path.length - 1 ? (
              <span aria-current="page" className={styles.current}>
                {titleOf(each)}
              </span>
            ) : (
              <Link variant="subtle" href={pagePath(workspace.slug, each.shortId)}>
                {titleOf(each)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};
