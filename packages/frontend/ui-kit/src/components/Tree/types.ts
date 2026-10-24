import type React from 'react';
import type { DragData } from '../../interaction/dnd';
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

/**
 * What a dragged row carries for anyone who listens (`treeItemDrag.get(source.data)`): the node,
 * and where it was. `tree` tells one Tree's rows from another's.
 */
export interface TreeDragItem {
  tree: string;
  node: TreeNode;
  parentId: string | null;
  index: number;
}

/**
 * Where a drag from outside the tree would land: the place among a parent's children; `onto` —
 * dropped on that node's middle, to go inside it (spec: Tree · 02).
 */
export interface TreeDropPlace extends TreeMoveTarget {
  onto?: string;
}

/**
 * Drags that are not this tree's own rows — another tree's page, a favorite, a card. The tree
 * draws the line or lights up the row as for its own; the app says what may land where.
 */
export interface TreeAccept {
  /** Asked while the drag moves over the rows, with the place it points at. */
  canDrop(data: DragData, place: TreeDropPlace): boolean;
  onDrop(data: DragData, place: TreeDropPlace): void;
}

export interface TreeHandle {
  /** Starts renaming a node — as soon as it is rendered (right after `onAdd` created it). */
  rename(id: string): void;
  focus(): void;
  /**
   * Brings a node to the user (G S, spec: Sidebar · 09): its ancestors are
   * expanded, the cursor is put on it, it is scrolled into view and the tree
   * takes focus. Default: the open page (`activeId`). A node not loaded yet is
   * ignored — the app reveals it once its branch is in `nodes`.
   */
  reveal(id?: string): void;
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
  /**
   * More data for a dragged row, next to the kit's own (`treeItemDrag`): the app's types
   * (`defineDragType`), so its drop targets elsewhere need not know a TreeNode. Rows are lifted
   * only with this or `onMove`: without both, the tree has no drag and drop.
   */
  dragData?(node: TreeNode): Record<string, unknown>;
  /** Drops from outside the tree. Without it, only the tree's own rows land here. */
  accept?: TreeAccept;
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
