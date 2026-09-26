import type { Meta, StoryObj } from '@storybook/react-vite';
import { CSSProperties, ReactNode, useRef, useState } from 'react';
import { Tree } from './Tree';
import type { TreeHandle, TreeMoveTarget, TreeNode } from './types';
import type { MenuItem } from '../Menu';
import { RouterContext, type RouterAdapter } from '../../router';
import { Surface, type SurfaceTone } from '../Surface';
import { cssVar } from '../../tokens';

/* Demo scaffolding only: stand-in page-type glyphs until the app has its own. */
const glyph = (d: string) => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  group: glyph('M2.5 4.5h4l1.5 1.5h5.5v6.5h-11z'),
  board: glyph('M2.5 2.5h11v11h-11zM6.5 2.5v11M10 2.5v7'),
  doc: glyph('M4 2.5h5.5l2.5 2.5v8.5h-8zM6 7.5h4M6 10h4'),
  lock: glyph('M4.5 7.5h7v6h-7zM6 7.5v-2a2 2 0 0 1 4 0v2'),
};

type Page = {
  id: string;
  label: string;
  icon: ReactNode;
  kids?: string[];
  lazy?: boolean;
  meta?: string;
  lock?: string;
};

const PAGES: Record<string, Page> = {
  web: { id: 'web', label: 'Web', icon: ICONS.group, kids: ['q3', 'req', 'retro'] },
  q3: { id: 'q3', label: 'Q3 board', icon: ICONS.board, meta: '42' },
  req: { id: 'req', label: 'Requirements', icon: ICONS.doc, kids: ['api', 'ux'] },
  api: { id: 'api', label: 'API contracts', icon: ICONS.doc },
  ux: { id: 'ux', label: 'UX notes', icon: ICONS.doc },
  retro: { id: 'retro', label: 'Q3 retro', icon: ICONS.doc },
  mobile: { id: 'mobile', label: 'Mobile', icon: ICONS.board, meta: '18' },
  infra: { id: 'infra', label: 'Infrastructure', icon: ICONS.board, lazy: true },
  archive: { id: 'archive', label: 'Archive', icon: ICONS.group, kids: [] },
  legal: { id: 'legal', label: 'Legal', icon: ICONS.lock, lock: 'You don’t have access to Legal' },
  long: { id: 'long', label: 'Migration plan for the old frontend and every plugin', icon: ICONS.doc },
};
const ROOT = ['web', 'mobile', 'infra', 'archive', 'legal', 'long'];

/** The app's side: pages as a flat map, turned into nodes; moves and renames applied optimistically. */
function usePages(log: (message: string) => void) {
  const [pages, setPages] = useState(PAGES);
  const [root, setRoot] = useState(ROOT);

  const toNode = (id: string): TreeNode => {
    const page = pages[id];

    return {
      id,
      label: page.label,
      icon: page.icon,
      hasChildren: page.kids !== undefined || page.lazy === true,
      children: page.kids?.map(toNode),
      canContain: page.lock === undefined,
      meta: page.meta,
      disabledReason: page.lock,
      href: `#/p/${id}`,
    };
  };

  const parentOf = (id: string) => Object.values(pages).find((page) => page.kids?.includes(id))?.id ?? null;

  const move = (id: string, to: TreeMoveTarget) => {
    const from = parentOf(id);
    const without = (list: string[]) => list.filter((kid) => kid !== id);
    const insert = (list: string[]) => [...list.slice(0, to.index), id, ...list.slice(to.index)];
    const next = { ...pages };
    let nextRoot = root;

    if (from === null) nextRoot = without(nextRoot);
    else next[from] = { ...next[from], kids: without(next[from].kids ?? []) };

    if (to.parentId === null) nextRoot = insert(nextRoot);
    else next[to.parentId] = { ...next[to.parentId], kids: insert(next[to.parentId].kids ?? []) };

    setPages(next);
    setRoot(nextRoot);
    log(`Moved “${pages[id].label}” · in the app, with an Undo toast`);
  };

  return {
    nodes: root.map(toNode),
    move,
    rename: (id: string, label: string) => {
      setPages((current) => ({ ...current, [id]: { ...current[id], label } }));
      log(`Renamed: “${label}”`);
    },
    load: (id: string) =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          setPages((current) => ({
            ...current,
            [id]: { ...current[id], lazy: false, kids: ['ci', 'deploy'] },
            ci: { id: 'ci', label: 'CI pipeline', icon: ICONS.doc },
            deploy: { id: 'deploy', label: 'Deploy checklist', icon: ICONS.doc },
          }));
          log(`Children of “${pages[id].label}” loaded`);
          resolve();
        }, 900),
      ),
    add: (parentId: string) => {
      const id = `new-${Date.now()}`;

      setPages((current) => ({
        ...current,
        [id]: { id, label: 'Untitled', icon: ICONS.doc },
        [parentId]: { ...current[parentId], kids: [...(current[parentId].kids ?? []), id] },
      }));

      return id;
    },
  };
}

const stand: CSSProperties = {
  display: 'flex',
  gap: cssVar('sp-6'),
  alignItems: 'flex-start',
  padding: cssVar('sp-6'),
  fontFamily: cssVar('font-ui'),
  fontSize: cssVar('type-meta'),
  color: cssVar('text-secondary'),
};

function Live({ tone = 'default' }: { tone?: SurfaceTone }) {
  const [log, setLog] = useState('Click the tree or Tab into it.');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['web']));
  const [active, setActive] = useState('q3');
  const treeRef = useRef<TreeHandle>(null);
  const pages = usePages(setLog);
  // The kit navigates through the app's router; here the 'router' just marks the page open.
  const [router] = useState<RouterAdapter>(() => ({
    navigate: (href) => {
      setActive(href.split('/').pop() as string);
      setLog(`Opened ${href}`);
    },
  }));

  const actions = (node: TreeNode): MenuItem[] => [
    { type: 'action', id: 'rename', label: 'Rename', keys: 'F2', onSelect: () => treeRef.current?.rename(node.id) },
    {
      type: 'action',
      id: 'tab',
      label: 'Open in new tab',
      keys: 'mod+enter',
      onSelect: () => setLog(`Would open “${node.label}” in a tab`),
    },
    { type: 'separator' },
    {
      type: 'action',
      id: 'delete',
      label: 'Delete',
      danger: true,
      onSelect: () => setLog(`Would delete “${node.label}” with Undo`),
    },
  ];

  return (
    <RouterContext.Provider value={router}>
      <Surface tone={tone} style={stand}>
        <div style={{ width: cssVar('sidebar-width') }}>
          <Tree
            ref={treeRef}
            aria-label="Pages"
            nodes={pages.nodes}
            expanded={expanded}
            onExpandedChange={setExpanded}
            activeId={active}
            loadChildren={pages.load}
            onRename={pages.rename}
            onMove={pages.move}
            actions={actions}
            onAdd={(parentId) => {
              const id = pages.add(parentId);

              setExpanded((current) => new Set(current).add(parentId));
              // Rename as soon as the new row is there.
              requestAnimationFrame(() => treeRef.current?.rename(id));
            }}
          />
        </div>
        <div style={{ display: 'grid', gap: cssVar('sp-3'), maxWidth: cssVar('popover-width-wide') }}>
          <span>{log}</span>
          <span>
            ↑↓ — cursor, → / ← — expand, collapse, to the parent, Enter — open, F2 — rename, mod+↑ / mod+↓ — reorder,
            mod+→ / mod+← — in and out, a letter — jump, * — expand the siblings, Shift F10 — the menu. Drag a row
            before, after or into another. “Infrastructure” loads its children, “Archive” is empty, “Legal” is closed.
          </span>
        </div>
      </Surface>
    </RouterContext.Provider>
  );
}

const meta: Meta<typeof Tree> = {
  title: 'Navigation/Tree',
  component: Tree,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<typeof Tree>;

export const PageTree: Story = { render: () => <Live /> };

/** The same tree on an inverse surface: every value comes from the inverse set (spec: Tree · 04). */
export const Inverse: Story = { render: () => <Live tone="inverse" /> };

const STATES: TreeNode[] = [
  {
    id: 'web',
    label: 'Web',
    icon: ICONS.group,
    hasChildren: true,
    children: [
      { id: 'q3', label: 'Q3 board', icon: ICONS.board, hasChildren: false, meta: '42' },
      { id: 'retro', label: 'Q3 retro', icon: ICONS.doc, hasChildren: false, error: 'Not moved: no connection.' },
    ],
  },
  { id: 'infra', label: 'Infrastructure', icon: ICONS.board, hasChildren: true },
  { id: 'archive', label: 'Archive', icon: ICONS.group, hasChildren: true, children: [] },
  { id: 'legal', label: 'Legal', icon: ICONS.lock, hasChildren: false, disabledReason: 'You don’t have access to Legal' },
];

/** Every row state side by side on both surfaces: open page, counter, failed edit, loading, empty, no access. */
export const Surfaces: Story = {
  render: () => (
    <div style={{ display: 'flex' }}>
      {(['default', 'inverse'] as const).map((tone) => (
        <Surface key={tone} tone={tone} style={stand}>
          <div style={{ width: cssVar('sidebar-width') }}>
            <Tree
              aria-label={`Pages on ${tone}`}
              nodes={STATES}
              expanded={new Set(['web', 'infra', 'archive'])}
              onExpandedChange={() => undefined}
              activeId="q3"
              loadChildren={() => new Promise(() => undefined)}
              onRetry={() => undefined}
              actions={() => []}
            />
          </div>
        </Surface>
      ))}
    </div>
  ),
};

const deep = (depth: number): TreeNode[] => [
  {
    id: `level-${depth}`,
    label: `Level ${depth + 1}`,
    icon: ICONS.group,
    hasChildren: depth < 8,
    children: depth < 8 ? deep(depth + 1) : undefined,
  },
];

/** Beyond six levels the indent stops growing; the path is in the tooltip. */
export const DeepNesting: Story = {
  render: () => {
    const all = new Set(Array.from({ length: 9 }, (_, depth) => `level-${depth}`));

    return (
      <div style={{ padding: cssVar('sp-6'), width: cssVar('sidebar-width'), boxSizing: 'content-box' }}>
        <Tree aria-label="Pages" nodes={deep(0)} expanded={all} onExpandedChange={() => undefined} activeId="level-8" />
      </div>
    );
  },
};

/** A failed rename or move: the stripe, the error in the tooltip, Retry. Children that did not load. */
export const Failures: Story = {
  render: () => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['broken']));

    return (
      <div style={{ padding: cssVar('sp-6'), width: cssVar('sidebar-width'), boxSizing: 'content-box' }}>
        <Tree
          aria-label="Pages"
          nodes={[
            { id: 'retro', label: 'Q3 retro', icon: ICONS.doc, hasChildren: false, error: 'Not moved: no connection.' },
            { id: 'broken', label: 'Infrastructure', icon: ICONS.board, hasChildren: true },
          ]}
          expanded={expanded}
          onExpandedChange={setExpanded}
          loadChildren={() => Promise.reject(new Error('offline'))}
          onRetry={() => undefined}
        />
      </div>
    );
  },
};

/** Density changes the row, never the chevron, the icon or the text. */
export const Densities: Story = {
  render: () => (
    <div style={stand}>
      {(['compact', 'default', 'comfortable'] as const).map((density) => (
        <div key={density} data-density={density} style={{ width: cssVar('sidebar-width') }}>
          <Tree
            aria-label={`Pages, ${density}`}
            nodes={[
              {
                id: 'web',
                label: 'Web',
                icon: ICONS.group,
                hasChildren: true,
                children: [{ id: 'q3', label: 'Q3 board', icon: ICONS.board, hasChildren: false, meta: '42' }],
              },
              { id: 'mobile', label: 'Mobile', icon: ICONS.board, hasChildren: false, meta: '18' },
            ]}
            expanded={new Set(['web'])}
            onExpandedChange={() => undefined}
            activeId="q3"
          />
        </div>
      ))}
    </div>
  ),
};
