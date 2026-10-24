import React, { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { IconButton, Tree, toast, type MenuItem, type TreeHandle, type TreeNode } from '@task-manager-v2/ui-kit';
import { PlusIcon } from '@task-manager-v2/ui-kit/icons';
import type { PageResponse } from '@task-manager-v2/api/main/schemas';
import { pagePath } from '../../../shared/constants/routes';
import { pageTreeQuery, toTreeNodes, usePageActions } from '../../../shared/pages';
import styles from './PagesSection.module.scss';

export interface PagesSectionProps {
  workspaceId: string;
  workspaceSlug: string;
  /** `pages.create_root`: the header's + is there, but disabled with the reason, without it. */
  canCreateRoot: boolean;
  /** The page of the address, by its short id. */
  openShortId?: string;
}

/**
 * The workspace's pages in the sidebar (spec: Sidebar · 03): the tree with its drag and drop,
 * F2, + and ⋯. A new page opens at once with its title to type (creation spec §00). Expanded
 * nodes are kept for this visit only.
 */
export const PagesSection: React.FC<PagesSectionProps> = ({
  workspaceId,
  workspaceSlug,
  canCreateRoot,
  openShortId,
}) => {
  const navigate = useNavigate();
  const treeRef = useRef<TreeHandle>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const { data: pages = [] } = useQuery(pageTreeQuery(workspaceId));
  const actions = usePageActions(workspaceId);

  const nodes = toTreeNodes(pages, workspaceSlug);
  const openId = pages.find((page) => page.shortId === openShortId)?.id;

  const open = (page: PageResponse) =>
    navigate(pagePath(workspaceSlug, page.shortId), { state: { focusTitle: true } });

  const createIn = async (parentId: string | null) => {
    try {
      const page = await actions.create('document', parentId);
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      open(page);
    } catch {
      toast.error({ message: 'Couldn’t create the page', retry: () => void createIn(parentId) });
    }
  };

  const menu = (node: TreeNode): MenuItem[] => [
    { type: 'action', id: 'add', label: 'Add page inside', onSelect: () => createIn(node.id) },
    { type: 'action', id: 'rename', label: 'Rename', keys: 'F2', onSelect: () => treeRef.current?.rename(node.id) },
    { type: 'separator' },
    { type: 'action', id: 'delete', label: 'Delete', danger: true, onSelect: () => actions.remove(node.id) },
  ];

  return (
    <section className={styles.section} aria-labelledby={`${workspaceId}-pages`}>
      <div className={styles.header}>
        <span id={`${workspaceId}-pages`} className={styles.title}>
          Pages
        </span>
        <IconButton
          size="sm"
          icon={<PlusIcon />}
          label="New page"
          disabled={!canCreateRoot}
          disabledReason="You can’t create top-level pages"
          onClick={() => void createIn(null)}
        />
      </div>

      <Tree
        ref={treeRef}
        aria-label="Pages"
        className={styles.tree}
        nodes={nodes}
        expanded={expanded}
        onExpandedChange={setExpanded}
        activeId={openId}
        onRename={(id, label) => void actions.rename(id, label)}
        onMove={(id, to) => void actions.move(id, to.parentId, to.index)}
        onAdd={(parentId) => void createIn(parentId)}
        actions={menu}
      />
    </section>
  );
};
