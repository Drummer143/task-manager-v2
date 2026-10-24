import { describe, expect, it } from 'vitest';
import {
  blockedOn,
  dropTarget,
  indexTree,
  keyboardMove,
  nextByLetter,
  rowMode,
  visibleRows,
  type TreeRow,
} from './model';
import type { TreeNode } from './types';

const leaf = (id: string, extra: Partial<TreeNode> = {}): TreeNode => ({ id, label: id, hasChildren: false, ...extra });
const group = (id: string, children: TreeNode[] | undefined, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  label: id,
  hasChildren: true,
  children,
  ...extra,
});

// web ─┬ q3
//      ├ req ─┬ api
//      │      └ ux
//      └ retro
// mobile
// infra (not loaded)
// archive (empty)
// legal (no access)
const NODES: TreeNode[] = [
  group('web', [leaf('q3'), group('req', [leaf('api'), leaf('ux')]), leaf('retro')]),
  leaf('mobile'),
  group('infra', undefined),
  group('archive', []),
  group('legal', [leaf('contracts')], { disabledReason: 'No access' }),
];
const INDEX = indexTree(NODES);

const ids = (rows: TreeRow[]) => rows.map((row) => (row.kind === 'node' ? row.node.id : `(${row.kind})`));
const rowOf = (rows: TreeRow[], id: string) =>
  rows.find((row): row is Extract<TreeRow, { kind: 'node' }> => row.kind === 'node' && row.node.id === id) as Extract<
    TreeRow,
    { kind: 'node' }
  >;

describe('visibleRows', () => {
  it('shows expanded nodes’ children and a note under expanded ones with nothing to show', () => {
    const rows = visibleRows(NODES, new Set(['web', 'infra', 'archive']), () => undefined);

    expect(ids(rows)).toEqual(['web', 'q3', 'req', 'retro', 'mobile', 'infra', '(loading)', 'archive', '(empty)', 'legal']);
    expect(rowOf(rows, 'req')).toMatchObject({ depth: 1, index: 1, setSize: 3, expanded: false });
  });

  it('a node without access never opens, whatever the expanded set says', () => {
    const rows = visibleRows(NODES, new Set(['legal']), () => undefined);

    expect(ids(rows)).not.toContain('contracts');
    expect(rowOf(rows, 'legal').expanded).toBe(false);
  });

  it('children that failed to load show the failure, not a skeleton', () => {
    const rows = visibleRows(NODES, new Set(['infra']), (id) => (id === 'infra' ? 'failed' : undefined));

    expect(ids(rows)).toContain('(failed)');
  });
});

describe('keyboardMove', () => {
  it('moves among the siblings and stops at the ends', () => {
    expect(keyboardMove(NODES, INDEX, 'req', 'up')).toEqual({ parentId: 'web', index: 0 });
    expect(keyboardMove(NODES, INDEX, 'req', 'down')).toEqual({ parentId: 'web', index: 2 });
    expect(keyboardMove(NODES, INDEX, 'q3', 'up')).toBeNull();
    expect(keyboardMove(NODES, INDEX, 'retro', 'down')).toBeNull();
  });

  it('goes into the previous sibling (at its end, opening it) — only if it can hold pages', () => {
    expect(keyboardMove(NODES, INDEX, 'retro', 'in')).toEqual({ parentId: 'req', index: 2, expand: 'req' });
    expect(keyboardMove(NODES, INDEX, 'req', 'in')).toBeNull();
  });

  it('goes one level up, right after the parent', () => {
    expect(keyboardMove(NODES, INDEX, 'api', 'out')).toEqual({ parentId: 'web', index: 2 });
    expect(keyboardMove(NODES, INDEX, 'mobile', 'out')).toBeNull();
  });

  it('a node without access does not move', () => {
    expect(keyboardMove(NODES, INDEX, 'legal', 'up')).toBeNull();
  });
});

describe('rowMode and blockedOn', () => {
  const rows = visibleRows(NODES, new Set(['web', 'req']), () => undefined);

  it('an open node with children has no "below"; the last of its siblings lets the pointer step out', () => {
    expect(rowMode(rowOf(rows, 'web'))).toBe('expanded');
    expect(rowMode(rowOf(rows, 'q3'))).toBe('standard');
    expect(rowMode(rowOf(rows, 'retro'))).toBe('last-in-group');
  });

  it('nothing goes inside a node that holds nothing', () => {
    expect(blockedOn(INDEX, rowOf(rows, 'q3'))).toEqual(['make-child']);
    expect(blockedOn(INDEX, rowOf(rows, 'archive'))).toEqual([]);
    expect(blockedOn(INDEX, rowOf(rows, 'legal'))).toEqual(['make-child']);
  });
});

describe('dropTarget', () => {
  const rows = visibleRows(NODES, new Set(['web', 'req']), () => undefined);
  const level = { currentLevel: 1, indentPerLevel: 16 };
  const above = { type: 'reorder-above', ...level } as const;
  const below = { type: 'reorder-below', ...level } as const;
  const child = { type: 'make-child', ...level } as const;

  it('above a row: that row’s place, the line at its top and its level', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'q3'), above, 'mobile')).toEqual({
      move: { parentId: 'web', index: 0 },
      rowId: 'q3',
      line: { edge: 'top', depth: 1 },
    });
  });

  it('counts the place without the dragged node when it moves within its parent', () => {
    // q3 (0) goes below retro (2): with q3 taken out, retro is at 1, so q3 lands at 2.
    expect(dropTarget(INDEX, rowOf(rows, 'retro'), below, 'q3')?.move).toEqual({ parentId: 'web', index: 2 });
  });

  it('a child of an open node goes to its first place, under the row', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'req'), child, 'mobile')).toEqual({
      move: { parentId: 'req', index: 0 },
      rowId: 'req',
      line: { edge: 'bottom', depth: 2 },
    });
  });

  it('into a closed container: at its end, the row lights up instead of a line', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'archive'), child, 'mobile')).toEqual({
      move: { parentId: 'archive', index: 0 },
      rowId: 'archive',
      line: null,
      onto: 'archive',
    });
    expect(dropTarget(INDEX, rowOf(rows, 'legal'), child, 'mobile')).toBeNull();
  });

  it('stepping out left under the last child: right after the ancestor on that level', () => {
    const reparent = { type: 'reparent', currentLevel: 2, indentPerLevel: 16, desiredLevel: 0 } as const;

    // Mobile is right there already (after web): q3 is moved instead
    expect(dropTarget(INDEX, rowOf(rows, 'ux'), reparent, 'q3')).toEqual({
      move: { parentId: null, index: 1 },
      rowId: 'ux',
      line: { edge: 'bottom', depth: 0 },
    });
  });

  it('never onto itself or inside itself; a blocked instruction is no target', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'req'), child, 'req')).toBeNull();
    expect(dropTarget(INDEX, rowOf(rows, 'api'), above, 'req')).toBeNull();
    expect(dropTarget(INDEX, rowOf(rows, 'api'), below, 'web')).toBeNull();
    expect(dropTarget(INDEX, rowOf(rows, 'q3'), { type: 'instruction-blocked', desired: child }, 'mobile')).toBeNull();
  });

  it('where it already is is no target', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'retro'), above, 'req')).toBeNull();
    expect(dropTarget(INDEX, rowOf(rows, 'q3'), below, 'req')).toBeNull();
  });

  it('a drag from outside takes nothing out first', () => {
    expect(dropTarget(INDEX, rowOf(rows, 'retro'), below, null)?.move).toEqual({ parentId: 'web', index: 3 });
  });
});

describe('nextByLetter', () => {
  const rows = visibleRows(NODES, new Set(['web']), () => undefined);

  it('jumps to the next visible node on that letter, round', () => {
    expect(nextByLetter(rows, 'web', 'r')).toBe('req');
    expect(nextByLetter(rows, 'req', 'R')).toBe('retro');
    expect(nextByLetter(rows, 'retro', 'r')).toBe('req');
    expect(nextByLetter(rows, 'web', 'z')).toBeUndefined();
  });
});
