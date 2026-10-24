import { createRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragFrame, dragOver, FakeDataTransfer, installFakeDrag } from '../../testing/dnd';
import { Tree } from './Tree';
import type { TreeDropPlace, TreeHandle, TreeMoveTarget, TreeNode, TreeProps } from './types';
import { treeItemDrag } from './dnd';
import { defineDragType, draggable, dropTargetForElements, type DragData } from '../../interaction/dnd';
import { RouterContext, type RouterAdapter } from '../../router';
import { useHotkeysStore } from '../../interaction/hotkeys';
import type { MenuItem } from '../Menu';

const leaf = (id: string, label: string, extra: Partial<TreeNode> = {}): TreeNode => ({
  id,
  label,
  hasChildren: false,
  href: `/p/${id}`,
  ...extra,
});

const NODES: TreeNode[] = [
  {
    ...leaf('web', 'Web'),
    hasChildren: true,
    children: [
      leaf('q3', 'Q3 board', { meta: '42' }),
      { ...leaf('req', 'Requirements'), hasChildren: true, children: [leaf('api', 'API contracts')] },
      leaf('retro', 'Q3 retro'),
    ],
  },
  leaf('mobile', 'Mobile'),
  { ...leaf('infra', 'Infrastructure'), hasChildren: true },
  { ...leaf('archive', 'Archive'), hasChildren: true, children: [] },
  leaf('legal', 'Legal', { disabledReason: 'You don’t have access to Legal' }),
];

type Props = Partial<Omit<TreeProps, 'expanded'>> & { initialExpanded?: string[]; router?: RouterAdapter };

/** The app's side: it owns the expanded set. */
const Owned = ({ initialExpanded = ['web'], router, onExpandedChange, ...props }: Props) => {
  const [expanded, setExpanded] = useState(new Set(initialExpanded));

  const tree = (
    <Tree
      aria-label="Pages"
      nodes={NODES}
      {...props}
      expanded={expanded}
      onExpandedChange={(next) => {
        onExpandedChange?.(next);
        setExpanded(next);
      }}
    />
  );

  return router ? <RouterContext.Provider value={router}>{tree}</RouterContext.Provider> : tree;
};

const tree = () => screen.getByRole('tree', { name: 'Pages' });
const item = (name: string) => screen.getByRole('treeitem', { name });
const cursorLabel = () => document.getElementById(tree().getAttribute('aria-activedescendant') ?? '')?.getAttribute('aria-label');
const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(tree(), { key, ...init });
const focusTree = () => act(() => tree().focus());

afterEach(() => {
  vi.restoreAllMocks();
  useHotkeysStore.setState({ hotkeys: {} });
});

describe('Tree', () => {
  describe('reveal (G S)', () => {
    it('expands the path to a node, puts the cursor on it and focuses the tree', () => {
      const ref = createRef<TreeHandle>();
      render(<Owned ref={ref} initialExpanded={[]} />);
      expect(screen.queryByRole('treeitem', { name: 'API contracts' })).toBeNull();

      act(() => ref.current?.reveal('api'));

      expect(item('Web').getAttribute('aria-expanded')).toBe('true');
      expect(item('Requirements').getAttribute('aria-expanded')).toBe('true');
      expect(cursorLabel()).toBe('API contracts');
      expect(document.activeElement).toBe(tree());
    });

    it('reveals the open page by default, even in a branch the user closed', () => {
      const ref = createRef<TreeHandle>();
      render(<Owned ref={ref} activeId="q3" />);
      fireEvent.click(within(item('Web')).getAllByRole('button', { hidden: true })[0]);
      expect(screen.queryByRole('treeitem', { name: 'Q3 board' })).toBeNull();

      act(() => ref.current?.reveal());

      expect(cursorLabel()).toBe('Q3 board');
    });

    it('ignores a node that is not loaded', () => {
      const ref = createRef<TreeHandle>();
      const onExpandedChange = vi.fn();
      render(<Owned ref={ref} onExpandedChange={onExpandedChange} />);

      act(() => ref.current?.reveal('nowhere'));

      expect(onExpandedChange).not.toHaveBeenCalled();
    });
  });

  describe('rows', () => {
    it('is a tree of levels, with the open page marked and the rest described', () => {
      render(<Owned activeId="q3" />);

      expect(item('Web').getAttribute('aria-level')).toBe('1');
      expect(item('Web').getAttribute('aria-expanded')).toBe('true');
      expect(item('Requirements').getAttribute('aria-expanded')).toBe('false');
      expect(item('Q3 board').getAttribute('aria-level')).toBe('2');
      expect(item('Q3 board').getAttribute('aria-current')).toBe('page');
      expect(item('Q3 board').getAttribute('aria-posinset')).toBe('1');
      expect(item('Q3 board').getAttribute('aria-setsize')).toBe('3');
      expect(item('Mobile').hasAttribute('aria-expanded')).toBe(false);
      expect(within(item('Q3 board')).getByText('42')).toBeTruthy();
    });

    it('is one Tab stop: nothing inside the tree is focusable by Tab', () => {
      render(<Owned onAdd={vi.fn()} actions={() => []} />);

      expect(tree().tabIndex).toBe(0);

      for (const element of tree().querySelectorAll<HTMLElement>('button, a')) {
        expect(element.tabIndex).toBe(-1);
      }
    });

    it('a node without access stays visible, dimmed, with the reason', () => {
      render(<Owned />);

      const legal = item('Legal');

      expect(legal.hasAttribute('data-locked')).toBe(true);
      expect(legal.getAttribute('data-tooltip-reason')).toBe('You don’t have access to Legal');
      expect(within(legal).getByText('no access')).toBeTruthy();
    });

    it('an expanded group with nothing inside says so', () => {
      render(<Owned initialExpanded={['archive']} />);

      expect(screen.getByText('No pages inside')).toBeTruthy();
    });

    it('opens the open page’s ancestors', () => {
      const onExpandedChange = vi.fn();

      render(<Owned initialExpanded={[]} activeId="api" onExpandedChange={onExpandedChange} />);

      expect([...onExpandedChange.mock.calls[0][0]].sort()).toEqual(['req', 'web']);
      expect(item('API contracts')).toBeTruthy();
    });
  });

  describe('mouse', () => {
    it('the chevron only toggles; the row opens the page', () => {
      const navigate = vi.fn();

      render(<Owned router={{ navigate }} />);

      fireEvent.click(within(item('Requirements')).getAllByRole('button', { hidden: true })[0]);
      expect(item('API contracts')).toBeTruthy();
      expect(navigate).not.toHaveBeenCalled();

      fireEvent.click(within(item('Mobile')).getByText('Mobile'));
      expect(navigate).toHaveBeenCalledWith('/p/mobile', { replace: undefined });
    });

    it('+ adds inside, ⋯ opens the node’s menu', async () => {
      const onAdd = vi.fn();
      const actions = vi.fn((node: TreeNode): MenuItem[] => [{ type: 'action', id: 'rename', label: `Rename ${node.label}` }]);

      render(<Owned onAdd={onAdd} actions={actions} />);

      const [, add, more] = within(item('Requirements')).getAllByRole('button', { hidden: true });

      fireEvent.click(add);
      expect(onAdd).toHaveBeenCalledWith('req');

      fireEvent.click(more);
      expect(await screen.findByRole('menuitem', { name: 'Rename Requirements' })).toBeTruthy();
    });
  });

  describe('keyboard', () => {
    it('↑ ↓ Home End walk the visible nodes', () => {
      render(<Owned activeId="q3" />);
      focusTree();

      expect(cursorLabel()).toBe('Q3 board');
      press('ArrowDown');
      expect(cursorLabel()).toBe('Requirements');
      press('End');
      expect(cursorLabel()).toBe('Legal');
      press('Home');
      expect(cursorLabel()).toBe('Web');
      press('ArrowUp');
      expect(cursorLabel()).toBe('Web');
    });

    it('→ opens, then goes to the first child; ← closes, then goes to the parent', () => {
      render(<Owned />);
      focusTree();

      press('Home');
      press('ArrowDown');
      press('ArrowDown');
      expect(cursorLabel()).toBe('Requirements');

      press('ArrowRight');
      expect(item('Requirements').getAttribute('aria-expanded')).toBe('true');
      press('ArrowRight');
      expect(cursorLabel()).toBe('API contracts');

      press('ArrowLeft');
      expect(cursorLabel()).toBe('Requirements');
      press('ArrowLeft');
      expect(item('Requirements').getAttribute('aria-expanded')).toBe('false');
      press('ArrowLeft');
      expect(cursorLabel()).toBe('Web');
    });

    it('a collapse under the cursor moves it to the nearest visible ancestor', () => {
      render(<Owned activeId="retro" />);
      focusTree();

      fireEvent.click(within(item('Web')).getAllByRole('button', { hidden: true })[0]);
      expect(cursorLabel()).toBe('Web');
    });

    it('Enter opens the page through the router, mod+Enter in a new tab; the cursor stays', () => {
      const navigate = vi.fn();
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);

      render(<Owned router={{ navigate }} activeId="q3" />);
      focusTree();

      press('ArrowDown');
      press('Enter');
      expect(navigate).toHaveBeenCalledWith('/p/req');
      expect(cursorLabel()).toBe('Requirements');

      press('Enter', { ctrlKey: true });
      expect(open).toHaveBeenCalledWith('/p/req', '_blank', 'noopener,noreferrer');
    });

    it('a letter jumps to the next node on it — unless the app took that letter', () => {
      render(<Owned activeId="q3" />);
      focusTree();

      press('m');
      expect(cursorLabel()).toBe('Mobile');

      useHotkeysStore.getState().registerHotkey('a', { key: 'a', description: 'Assignee', callback: vi.fn() });
      press('a');
      expect(cursorLabel()).toBe('Mobile');
    });

    it('* opens every sibling that has children', () => {
      render(<Owned initialExpanded={['web']} activeId="q3" />);
      focusTree();

      press('*');
      expect(item('Requirements').getAttribute('aria-expanded')).toBe('true');
    });

    it('mod+arrows move the node; mod+→ goes into the previous sibling and opens it', () => {
      const onMove = vi.fn<(id: string, to: TreeMoveTarget) => void>();
      const onExpandedChange = vi.fn();

      render(<Owned activeId="retro" onMove={onMove} onExpandedChange={onExpandedChange} />);
      focusTree();

      press('ArrowUp', { ctrlKey: true });
      expect(onMove).toHaveBeenLastCalledWith('retro', { parentId: 'web', index: 1 });

      press('ArrowRight', { ctrlKey: true });
      expect(onMove).toHaveBeenLastCalledWith('retro', { parentId: 'req', index: 1 });
      expect(onExpandedChange.mock.lastCall?.[0].has('req')).toBe(true);

      press('ArrowLeft', { ctrlKey: true });
      expect(onMove).toHaveBeenLastCalledWith('retro', { parentId: null, index: 1 });
    });

    it('Shift+F10 opens the cursor node’s menu; closing it returns to the tree', async () => {
      render(
        <Owned activeId="mobile" actions={(node) => [{ type: 'action', id: 'rename', label: `Rename ${node.label}` }]} />,
      );
      focusTree();

      press('F10', { shiftKey: true });
      const menu = await screen.findByRole('menu');

      expect(within(menu).getByRole('menuitem', { name: 'Rename Mobile' })).toBeTruthy();

      fireEvent.keyDown(menu, { key: 'Escape' });
      await waitFor(() => expect(document.activeElement).toBe(tree()));
    });
  });

  describe('rename', () => {
    it('F2, then Enter saves the trimmed name and returns to the tree', () => {
      const onRename = vi.fn();

      render(<Owned activeId="mobile" onRename={onRename} />);
      focusTree();

      press('F2');
      const field = screen.getByRole('textbox', { name: 'Page name' });

      expect(document.activeElement).toBe(field);
      fireEvent.change(field, { target: { value: '  Mobile app  ' } });
      fireEvent.keyDown(field, { key: 'Enter' });

      expect(onRename).toHaveBeenCalledWith('mobile', 'Mobile app');
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(document.activeElement).toBe(tree());
    });

    it('Esc, an empty or an unchanged name save nothing', () => {
      const onRename = vi.fn();

      render(<Owned activeId="mobile" onRename={onRename} />);
      focusTree();

      press('F2');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Other' } });
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });

      press('F2');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
      fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

      press('F2');
      fireEvent.blur(screen.getByRole('textbox'));

      expect(onRename).not.toHaveBeenCalled();
    });

    it('a node without access is not renamed', () => {
      render(<Owned activeId="legal" onRename={vi.fn()} />);
      focusTree();

      press('F2');
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  describe('lazy children', () => {
    it('asks once when an unloaded node opens; a failure offers Retry', async () => {
      const loadChildren = vi.fn().mockRejectedValueOnce(new Error('offline')).mockReturnValue(new Promise(() => undefined));

      render(<Owned loadChildren={loadChildren} />);

      fireEvent.click(within(item('Infrastructure')).getAllByRole('button', { hidden: true })[0]);
      expect(loadChildren).toHaveBeenCalledTimes(1);
      expect(loadChildren).toHaveBeenCalledWith('infra');

      fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(loadChildren).toHaveBeenCalledTimes(2));
    });
  });

  describe('failed edits', () => {
    it('a node whose move failed shows the error and Retry', () => {
      const onRetry = vi.fn();
      const nodes = [leaf('retro', 'Q3 retro', { error: 'Not moved: no connection.' })];

      render(<Tree aria-label="Pages" nodes={nodes} expanded={new Set()} onExpandedChange={vi.fn()} onRetry={onRetry} />);

      expect(item('Q3 retro').getAttribute('data-tooltip')).toBe('Not moved: no connection.');
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(onRetry).toHaveBeenCalledWith('retro');
    });
  });

  describe('drag and drop', () => {
    installFakeDrag();

    /** jsdom has no layout: every row is 28 px, stacked from the top, 240 px wide. */
    const layOut = () => {
      [...tree().querySelectorAll<HTMLElement>('[data-tree-row]')].forEach((row, position) => {
        vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(DOMRect.fromRect({ x: 0, y: position * 28, width: 240, height: 28 }));
      });
    };

    const row = (label: string) => item(label);

    it('a row dropped on the middle of a container goes inside it', async () => {
      const onMove = vi.fn();

      render(<Owned onMove={onMove} />);
      layOut();

      await dragOver(row('Mobile'), row('Archive'));
      expect(row('Archive').getAttribute('data-drop')).toBe('into');
      expect(row('Mobile').hasAttribute('data-drag-source')).toBe(true);

      fireEvent.drop(row('Archive'), { dataTransfer: new FakeDataTransfer(), clientX: 60, clientY: row('Archive').getBoundingClientRect().top + 14 });
      await dragFrame();

      expect(onMove).toHaveBeenCalledWith('mobile', { parentId: 'archive', index: 0 });
      expect(row('Archive').hasAttribute('data-drop')).toBe(false);
    });

    it('the top of a row is the place before it: a line', async () => {
      const onMove = vi.fn();

      render(<Owned onMove={onMove} />);
      layOut();

      await dragOver(row('Mobile'), row('Q3 board'), { y: 2, drop: true });

      expect(onMove).toHaveBeenCalledWith('mobile', { parentId: 'web', index: 0 });
    });

    it('never into itself or its own children', async () => {
      const onMove = vi.fn();

      render(<Owned onMove={onMove} />);
      layOut();

      await dragOver(row('Web'), row('Requirements'), { drop: true });

      expect(onMove).not.toHaveBeenCalled();
    });

    it('a row carries its node and the app’s data out, and its address for other apps', async () => {
      const received = vi.fn();
      const pageDrag = defineDragType<{ pageId: string }>('page');
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      const cleanup = dropTargetForElements({
        element: outside,
        canDrop: ({ source }) => treeItemDrag.is(source.data),
        onDrop: ({ source }) => received(treeItemDrag.get(source.data)?.node.id, pageDrag.get(source.data)),
      });

      render(<Owned onMove={vi.fn()} dragData={(node) => pageDrag.data({ pageId: node.id })} />);
      layOut();

      const { dataTransfer } = await dragOver(row('Mobile'), outside, { drop: true });

      expect(received).toHaveBeenCalledWith('mobile', { pageId: 'mobile' });
      expect(dataTransfer.getData('text/uri-list')).toBe(new URL('/p/mobile', window.location.href).href);

      cleanup();
      outside.remove();
    });

    it('takes a drag from outside where the app accepts it, with the place it points at', async () => {
      const cardDrag = defineDragType<{ cardId: string }>('card');
      const card = document.createElement('div');
      document.body.appendChild(card);
      const cleanup = draggable({ element: card, getInitialData: () => cardDrag.data({ cardId: 'c1' }) });
      const accept = {
        // Only inside a node
        canDrop: vi.fn((_data: DragData, place: TreeDropPlace) => place.onto !== undefined),
        onDrop: vi.fn(),
      };

      render(<Owned accept={accept} />);
      layOut();

      await dragOver(card, row('Q3 board'), { y: 2 });
      expect(row('Q3 board').hasAttribute('data-drop')).toBe(false);
      expect(tree().querySelector('[data-edge]')).toBeNull();

      await dragOver(card, row('Archive'), { drop: true });

      expect(accept.onDrop).toHaveBeenCalledWith(expect.objectContaining(cardDrag.data({ cardId: 'c1' })), {
        parentId: 'archive',
        index: 0,
        onto: 'archive',
      });

      cleanup();
      card.remove();
    });

    it('without accept, nothing from outside lands', async () => {
      const onMove = vi.fn();
      const other = document.createElement('div');
      document.body.appendChild(other);
      const cleanup = draggable({ element: other, getInitialData: () => ({ something: true }) });

      render(<Owned onMove={onMove} />);
      layOut();

      await dragOver(other, row('Archive'), { drop: true });

      expect(onMove).not.toHaveBeenCalled();
      expect(row('Archive').hasAttribute('data-drop')).toBe(false);

      cleanup();
      other.remove();
    });

    it('resting on a collapsed node opens it', async () => {
      render(<Owned onMove={vi.fn()} />);
      layOut();

      await dragOver(row('Mobile'), row('Requirements'));
      expect(screen.queryByRole('treeitem', { name: 'API contracts' })).toBeNull();

      // --tree-hover-expand
      await act(() => new Promise((resolve) => setTimeout(resolve, 650)));

      expect(row('API contracts')).toBeTruthy();
    });

    it('a row without access is not lifted', async () => {
      const onMove = vi.fn();

      render(<Owned onMove={onMove} />);
      layOut();

      await dragOver(row('Legal'), row('Archive'), { drop: true });

      expect(onMove).not.toHaveBeenCalled();
    });

    it('without onMove, dragData and accept, the tree has no drag and drop', async () => {
      const received = vi.fn();
      const outside = document.createElement('div');
      document.body.appendChild(outside);
      const cleanup = dropTargetForElements({ element: outside, onDrop: received });

      render(<Owned />);
      layOut();

      expect(row('Mobile').getAttribute('draggable')).toBeNull();

      await dragOver(row('Mobile'), outside, { drop: true });

      expect(received).not.toHaveBeenCalled();

      cleanup();
      outside.remove();
    });

    it('dragData alone lifts rows out, while nothing lands in the tree', async () => {
      const onMove = vi.fn();

      render(<Owned dragData={() => ({})} />);
      layOut();

      expect(row('Mobile').getAttribute('draggable')).toBe('true');

      await dragOver(row('Mobile'), row('Archive'), { drop: true });

      expect(row('Archive').hasAttribute('data-drop')).toBe(false);
      expect(onMove).not.toHaveBeenCalled();
    });
  });
});
