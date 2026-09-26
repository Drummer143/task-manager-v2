import type React from 'react';
import type { MenuItem } from '../Menu';

export interface TreeNode {
  id: string;
  label: string;
  /** The page type's icon, drawn by the app; the kit sizes it. */
  icon?: React.ReactNode;
  /** The chevron is there before the children are loaded. */
  hasChildren: boolean;
  /** Absent while `hasChildren`: not loaded yet — expanding asks `loadChildren`. */
  children?: TreeNode[];
  /** Other nodes can go inside: the "into" drop zone, mod+→, the + action. Default: `hasChildren`. */
  canContain?: boolean;
  /**
   * No access, and why: the row stays visible (the parent shows its structure),
   * dimmed, with the reason in a tooltip. It cannot be expanded, renamed or
   * moved; opening it leads to the app's No access screen.
   */
  disabledReason?: string;
  /** The counter at the right (tasks on a board). */
  meta?: string;
  /** Where the page lives: a click, Enter, mod+Enter (a new tab). */
  href?: string;
  /** The last rename or move of this node failed: a danger stripe, this text in a tooltip, Retry. */
  error?: string;
}

/** Where a node goes: the index is among the new parent's children with the node itself taken out. */
export interface TreeMoveTarget {
  parentId: string | null;
  index: number;
}

export interface TreeHandle {
  /** Starts renaming a node — as soon as it is rendered (right after `onAdd` created it). */
  rename(id: string): void;
  focus(): void;
}

export interface TreeProps {
  nodes: TreeNode[];
  /** Controlled: the app keeps it locally (not in the URL). */
  expanded: ReadonlySet<string>;
  onExpandedChange(expanded: Set<string>): void;
  /** The open page: highlighted, its ancestors expanded, scrolled into view. */
  activeId?: string;
  /**
   * An expanded node without `children`: fetch them and put them into `nodes`.
   * The tree shows a skeleton (after 200 ms) while the promise is pending and
   * "Couldn’t load · Retry" if it rejects. The kit keeps no copy of the data.
   */
  loadChildren?(id: string): Promise<unknown>;
  /** F2. A trimmed, non-empty, changed name only. Optimistic: the app updates `nodes`. */
  onRename?(id: string, label: string): void;
  /** Drag and drop, mod+arrows. Optimistic, with the app's undo toast. */
  onMove?(id: string, to: TreeMoveTarget): void;
  /** The row's ⋯, the right click, Shift+F10. */
  actions?(node: TreeNode): MenuItem[];
  /** The row's +: create a page inside, then usually `ref.rename(newId)`. */
  onAdd?(parentId: string): void;
  /** Retry of a node with `error`. */
  onRetry?(id: string): void;
  'aria-label': string;
  className?: string;
  ref?: React.Ref<TreeHandle>;
}
