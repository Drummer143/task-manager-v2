import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { Button, EmptyState, ErrorState, LinkBase, toast } from '@task-manager-v2/ui-kit';
import { PlusIcon } from '@task-manager-v2/ui-kit/icons';
import type { PageResponse } from '@task-manager-v2/api/main/schemas';
import { pagePath } from '../../shared/constants/routes';
import { PageIcon, pageByShortIdQuery, pageTreeQuery, titleOf, usePageActions } from '../../shared/pages';
import { useWorkspace } from '../../shared/workspaces';
import { PageTitle } from './PageTitle';
import styles from './Page.module.scss';

/** What a page's body will be, until the editor and the boards are built. */
const BODY_LATER: Record<'document' | 'board', string> = {
  document: 'The editor comes here.',
  board: 'The board’s description and views come here.',
};

/** A group's children, larger than in the tree, and New page at the end (pages spec §6). */
const GroupChildren: React.FC<{ page: PageResponse; onCreate(): void }> = ({ page, onCreate }) => {
  const { slug } = useWorkspace();
  const { data: pages = [] } = useQuery(pageTreeQuery(page.workspaceId));
  const children = pages.filter((each) => each.parentId === page.id);

  return (
    <ul className={styles.children}>
      {children.map((child) => (
        <li key={child.id}>
          <LinkBase className={styles.child} href={pagePath(slug, child.shortId)}>
            <span className={styles.childIcon}>
              <PageIcon type={child.type} icon={child.icon} />
            </span>
            {titleOf(child)}
          </LinkBase>
        </li>
      ))}
      <li>
        <Button variant="ghost" icon={<PlusIcon />} onClick={onCreate}>
          New page
        </Button>
      </li>
    </ul>
  );
};

/** A live page: its icon, title, and what its type holds. */
const PageCanvas: React.FC<{ page: PageResponse }> = ({ page }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useWorkspace();
  const actions = usePageActions(page.workspaceId);
  const focusTitle = (location.state as { focusTitle?: boolean } | null)?.focusTitle === true;

  const createChild = async () => {
    try {
      const child = await actions.create('document', page.id);
      navigate(pagePath(slug, child.shortId), { state: { focusTitle: true } });
    } catch {
      toast.error({ message: 'Couldn’t create the page' });
    }
  };

  return (
    <article className={styles.canvas}>
      <div className={styles.column}>
        {page.icon?.kind === 'emoji' && (
          <span className={styles.icon}>
            <PageIcon type={page.type} icon={page.icon} />
          </span>
        )}
        <PageTitle
          // Another page: a fresh field, not the last one's edit
          key={page.id}
          title={page.title}
          autoFocus={focusTitle}
          onSave={(title) => void actions.rename(page.id, title)}
        />
        {page.type === 'group' ? (
          <GroupChildren page={page} onCreate={() => void createChild()} />
        ) : (
          <p className={styles.later}>{BODY_LATER[page.type]}</p>
        )}
      </div>
    </article>
  );
};

const isNotFound = (error: unknown) => isAxiosError(error) && error.response?.status === 404;

/**
 * A page of the workspace by its address, `/{ws}/p/{shortId}` (pages spec §2): the canvas of a
 * live one, "This page is in Trash" with Restore for a trashed one.
 */
export const Page: React.FC = () => {
  const { shortId = '' } = useParams();
  const workspace = useWorkspace();
  const actions = usePageActions(workspace.id);
  const query = useQuery(pageByShortIdQuery(workspace.id, shortId));

  if (query.isPending) return null;

  if (query.isError) {
    return isNotFound(query.error) ? (
      <EmptyState title="This page doesn’t exist" description="It may have been deleted from the trash." />
    ) : (
      <ErrorState title="Couldn’t open this page" onRetry={() => void query.refetch()} />
    );
  }

  const page = query.data;

  if (page.deletedAt) {
    const root = page.deletedRoot ?? page.id;

    return (
      <EmptyState
        title="This page is in Trash"
        description={root === page.id ? undefined : 'It was deleted with a page above it: restoring brings both back.'}
        action={{
          label: 'Restore',
          onAction: () => {
            actions.restore(root).catch(() => toast.error({ message: 'Couldn’t restore the page' }));
          },
        }}
      />
    );
  }

  return <PageCanvas page={page} />;
};
