import React from 'react';
import { BoardIcon, DocumentIcon, GroupIcon } from '@task-manager-v2/ui-kit/icons';
import type { PageIcon as PageIconValue, PageType } from '@task-manager-v2/api/main/schemas';

const TYPE_ICONS: Record<PageType, React.FC> = {
  document: DocumentIcon,
  board: BoardIcon,
  group: GroupIcon,
};

export interface PageIconProps {
  type: PageType;
  icon?: PageIconValue | null;
}

/**
 * A page's own icon, else its type's (pages spec §1). Only emoji are picked yet: a Lucide name
 * or an upload falls back to the type's icon. Sized by its slot, as the kit's icons are.
 */
export const PageIcon: React.FC<PageIconProps> = ({ type, icon }) => {
  if (icon?.kind === 'emoji') {
    return <span aria-hidden="true">{icon.value}</span>;
  }

  const TypeIcon = TYPE_ICONS[type];

  return <TypeIcon />;
};
