import { createIcon } from './createIcon';

/* Checkbox marks: a heavier stroke, drawn at 12 px inside a 16 px box. */
export const CheckIcon = createIcon(
  'CheckIcon',
  <path d="M20 6 9 17l-5-5" />,
  3,
);
export const MinusIcon = createIcon('MinusIcon', <path d="M5 12h14" />, 3);

/* A removable tag's ×. */
export const XIcon = createIcon(
  'XIcon',
  <path d="M18 6 6 18M6 6l12 12" />,
  2.5,
);

/* A submenu's chevron. */
export const ChevronRightIcon = createIcon(
  'ChevronRightIcon',
  <path d="m9 18 6-6-6-6" />,
);

/* The palette's and a filter's magnifier. */
export const SearchIcon = createIcon(
  'SearchIcon',
  <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14" />,
);

/* A tree node's chevron: the glyph changes, it never rotates (spec: Tree · animations). */
export const ChevronDownIcon = createIcon(
  'ChevronDownIcon',
  <path d="m6 9 6 6 6-6" />,
);

/* Something failed — an error toast. */
export const AlertIcon = createIcon(
  'AlertIcon',
  <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M12 8v4M12 16h.01" />,
);

/* Add inside — a tree node's action. */
export const PlusIcon = createIcon('PlusIcon', <path d="M12 5v14M5 12h14" />);

/* More actions — the menu of a row. */
export const MoreHorizontalIcon = createIcon(
  'MoreHorizontalIcon',
  <path d="M12 12h.01M19 12h.01M5 12h.01" />,
  3,
);

export const ArrowUpRightIcon = createIcon(
  'ArrowUpRightIcon',
  <>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </>,
  1.5,
);

export const InboxIcon = createIcon(
  'InboxIcon',
  <>
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </>,
);

/* The sidebar's collapse (⇤, in its header) and expand (⇥, at the foot of the rail). */
export const SidebarCollapseIcon = createIcon(
  'SidebarCollapseIcon',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>,
  1.5,
);

export const SidebarExpandIcon = createIcon(
  'SidebarExpandIcon',
  <>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="m14 9 3 3-3 3" />
  </>,
  1.5,
);

export const MarkReadIcon = createIcon(
  'MarkReadIcon',
  <circle cx="12" cy="12" r="5" />,
  1,
);

export const MarkUnreadIcon = createIcon(
  'MarkUnreadIcon',
  <circle cx="12" cy="12" r="5" fill="currentColor" />,
  1,
);

export const ArchiveIcon = createIcon(
  'ArchiveIcon',
  <>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </>,
  1,
);

export const ArchiveRestoreIcon = createIcon(
  'ArchiveRestoreIcon',
  <>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h2" />
    <path d="M20 8v11a2 2 0 0 1-2 2h-2" />
    <path d="m9 15 3-3 3 3" />
    <path d="M12 12v9" />
  </>,
  1,
);
