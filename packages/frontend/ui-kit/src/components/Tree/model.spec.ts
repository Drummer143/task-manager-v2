import { describe, expect, it } from 'vitest';
import {
  dropTarget,
  indexTree,
  keyboardMove,
  nextByLetter,
  visibleRows,
  zoneAt,
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

describe('zoneAt', () => {
  it('a container splits into quarters: before, into, after', () => {
    expect(zoneAt(0.1, true)).toBe('before');
    expect(zoneAt(0.5, true)).toBe('into');
    expect(zoneAt(0.9, true)).toBe('after');
  });

  it('a leaf splits in halves', () => {
    expect(zoneAt(0.4, false)).toBe('before');
    expect(zoneAt(0.6, false)).toBe('after');
  });
});

describe('dropTarget', () => {
  const rows = visibleRows(NODES, new Set(['web', 'req']), () => undefined);

  it('before a row: that row’s place, the line at its top and its level', () => {
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'q3'), 'before', 'mobile')).toEqual({
      move: { parentId: 'web', index: 0 },
      rowId: 'q3',
      line: { edge: 'top', depth: 1 },
    });
  });

  it('counts the place without the dragged node when it moves within its parent', () => {
    // q3 (0) goes after retro (2): with q3 taken out, retro is at 1, so q3 lands at 2.
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'retro'), 'after', 'q3')?.move).toEqual({ parentId: 'web', index: 2 });
  });

  it('after an open node means its first child’s place', () => {
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'req'), 'after', 'mobile')).toEqual({
      move: { parentId: 'req', index: 0 },
      rowId: 'req',
      line: { edge: 'bottom', depth: 2 },
    });
  });

  it('into a container: at its end, the row lights up instead of a line', () => {
    const archive = rowOf(rows, 'archive');

    expect(dropTarget(NODES, INDEX, archive, 'into', 'mobile')).toEqual({
      move: { parentId: 'archive', index: 0 },
      rowId: 'archive',
      line: null,
    });
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'legal'), 'into', 'mobile')).toBeNull();
  });

  it('never onto itself or inside itself', () => {
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'req'), 'into', 'req')).toBeNull();
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'api'), 'before', 'req')).toBeNull();
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'api'), 'after', 'web')).toBeNull();
  });

  it('where it already is is no target', () => {
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'retro'), 'before', 'req')).toBeNull();
    expect(dropTarget(NODES, INDEX, rowOf(rows, 'q3'), 'after', 'req')).toBeNull();
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
