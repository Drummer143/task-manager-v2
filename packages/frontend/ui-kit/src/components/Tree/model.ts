import type { TreeMoveTarget, TreeNode } from './types';

/** Where every known node sits. */
export interface NodePlace {
  node: TreeNode;
  parentId: string | null;
  index: number;
  depth: number;
}

export type TreeIndex = Map<string, NodePlace>;

/** A loaded child list's state, while it is not in `nodes` yet. */
export type LoadState = 'pending' | 'failed';

export type TreeRow =
  | {
      kind: 'node';
      node: TreeNode;
      depth: number;
      parentId: string | null;
      /** Position among the siblings, for aria-posinset / aria-setsize. */
      index: number;
      setSize: number;
      expanded: boolean;
    }
  | { kind: 'loading' | 'failed' | 'empty'; parentId: string; depth: number };

export const isExpandable = (node: TreeNode) => node.hasChildren && node.disabledReason === undefined;

export const canContain = (node: TreeNode) =>
  (node.canContain ?? node.hasChildren) && node.disabledReason === undefined;

export const indexTree = (nodes: TreeNode[]): TreeIndex => {
  const index: TreeIndex = new Map();

  const walk = (list: TreeNode[], parentId: string | null, depth: number) =>
    list.forEach((node, position) => {
      index.set(node.id, { node, parentId, index: position, depth });

      if (node.children) {
        walk(node.children, node.id, depth + 1);
      }
    });

  walk(nodes, null, 0);

  return index;
};

export const childrenOf = (nodes: TreeNode[], index: TreeIndex, parentId: string | null) =>
  parentId === null ? nodes : (index.get(parentId)?.node.children ?? []);

/** The ids from the top level down to the node's parent. */
export const ancestorsOf = (index: TreeIndex, id: string) => {
  const ancestors: string[] = [];
  let parentId = index.get(id)?.parentId ?? null;

  while (parentId !== null) {
    ancestors.unshift(parentId);
    parentId = index.get(parentId)?.parentId ?? null;
  }

  return ancestors;
};

/** The node itself or any node inside it. */
export const isWithin = (index: TreeIndex, id: string, ancestorId: string) =>
  id === ancestorId || ancestorsOf(index, id).includes(ancestorId);

/** What is on screen, top to bottom: nodes, and a note under an expanded one that has none to show. */
export const visibleRows = (
  nodes: TreeNode[],
  expanded: ReadonlySet<string>,
  loadState: (id: string) => LoadState | undefined,
): TreeRow[] => {
  const rows: TreeRow[] = [];

  const walk = (list: TreeNode[], parentId: string | null, depth: number) =>
    list.forEach((node, index) => {
      const open = isExpandable(node) && expanded.has(node.id);

      rows.push({
        kind: 'node',
        node,
        depth,
        parentId,
        index,
        setSize: list.length,
        expanded: open,
      });

      if (!open) {
        return;
      }

      if (node.children === undefined) {
        rows.push({
          kind: loadState(node.id) === 'failed' ? 'failed' : 'loading',
          parentId: node.id,
          depth: depth + 1,
        });
      } else if (node.children.length === 0) {
        rows.push({ kind: 'empty', parentId: node.id, depth: depth + 1 });
      } else {
        walk(node.children, node.id, depth + 1);
      }
    });

  walk(nodes, null, 0);

  return rows;
};

export type KeyboardMove = 'up' | 'down' | 'in' | 'out';

/**
 * mod+↑ / mod+↓ — among the siblings, mod+→ — to the end of the previous
 * sibling, mod+← — one level up, right after the parent. `expand` is the new
 * parent to open, so the node stays in view.
 */
export const keyboardMove = (
  nodes: TreeNode[],
  index: TreeIndex,
  id: string,
  move: KeyboardMove,
): (TreeMoveTarget & { expand?: string }) | null => {
  const place = index.get(id);

  if (!place || place.node.disabledReason !== undefined) {
    return null;
  }

  const siblings = childrenOf(nodes, index, place.parentId);

  switch (move) {
    case 'up':
      return place.index > 0 ? { parentId: place.parentId, index: place.index - 1 } : null;
    case 'down':
      return place.index < siblings.length - 1 ? { parentId: place.parentId, index: place.index + 1 } : null;
    case 'in': {
      const previous = siblings[place.index - 1];

      return previous && canContain(previous)
        ? {
            parentId: previous.id,
            index: previous.children?.length ?? 0,
            expand: previous.id,
          }
        : null;
    }
    case 'out': {
      const parent = place.parentId === null ? undefined : index.get(place.parentId);

      return parent ? { parentId: parent.parentId, index: parent.index + 1 } : null;
    }
  }
};

export type DropZone = 'before' | 'after' | 'into';

/** Share of the row at the top and at the bottom that means "before" / "after" (spec: Tree · 02). */
const EDGE_SHARE = 0.25;

/** Where on the row the pointer is: the top quarter, the bottom quarter, the middle (only for a container). */
export const zoneAt = (fraction: number, container: boolean): DropZone => {
  if (container) {
    return fraction < EDGE_SHARE ? 'before' : fraction > 1 - EDGE_SHARE ? 'after' : 'into';
  }

  return fraction < 0.5 ? 'before' : 'after';
};

export interface DropTarget {
  move: TreeMoveTarget;
  /** The row that shows it. */
  rowId: string;
  /** The insertion line at the row's edge, from the indent of the level the node goes to; none — the row itself lights up. */
  line: { edge: 'top' | 'bottom'; depth: number } | null;
}

/**
 * The drop a pointer over a row means, or null where nothing may go: onto the
 * node itself, inside it or its descendants, into a closed one, or where it
 * already is.
 */
export const dropTarget = (
  nodes: TreeNode[],
  index: TreeIndex,
  row: Extract<TreeRow, { kind: 'node' }>,
  zone: DropZone,
  draggedId: string,
): DropTarget | null => {
  const dragged = index.get(draggedId);

  if (!dragged || isWithin(index, row.node.id, draggedId)) {
    return null;
  }

  // Siblings after the dragged one move up by one once it is taken out.
  const at = (parentId: string | null, position: number) =>
    dragged.parentId === parentId && dragged.index < position ? position - 1 : position;

  const unchanged = (move: TreeMoveTarget) => move.parentId === dragged.parentId && move.index === dragged.index;

  let target: DropTarget;

  if (zone === 'into') {
    if (!canContain(row.node)) {
      return null;
    }

    const count = row.node.children?.length ?? 0;

    target = {
      move: { parentId: row.node.id, index: at(row.node.id, count) },
      rowId: row.node.id,
      line: null,
    };
  } else if (zone === 'after' && row.expanded && (row.node.children?.length ?? 0) > 0) {
    // Right under an open node is its first child's place, not its next sibling's.
    target = {
      move: { parentId: row.node.id, index: at(row.node.id, 0) },
      rowId: row.node.id,
      line: { edge: 'bottom', depth: row.depth + 1 },
    };
  } else {
    const parent = row.parentId === null ? undefined : index.get(row.parentId)?.node;

    if (parent && !canContain(parent)) {
      return null;
    }

    const position = zone === 'before' ? row.index : row.index + 1;

    target = {
      move: { parentId: row.parentId, index: at(row.parentId, position) },
      rowId: row.node.id,
      line: { edge: zone === 'before' ? 'top' : 'bottom', depth: row.depth },
    };
  }

  return unchanged(target.move) ? null : target;
};

/** The next visible node whose label starts with the letter, after the cursor, round. */
export const nextByLetter = (rows: TreeRow[], cursorId: string | undefined, letter: string) => {
  const nodeRows = rows.filter((row): row is Extract<TreeRow, { kind: 'node' }> => row.kind === 'node');
  const from = nodeRows.findIndex((row) => row.node.id === cursorId);
  const wanted = letter.toLocaleLowerCase();

  for (let step = 1; step <= nodeRows.length; step++) {
    const row = nodeRows[(from + step + nodeRows.length) % nodeRows.length];

    if (row.node.label.toLocaleLowerCase().startsWith(wanted)) {
      return row.node.id;
    }
  }

  return undefined;
};
