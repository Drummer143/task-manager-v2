import React, { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx, detectPlatform } from '../../utils';
import { useMessages } from '../../messages';
import { useRouter } from '../../router';
import { isAppHotkey } from '../../interaction/hotkeys';
import { ContextMenu, type ContextMenuHandle } from '../Menu';
import { Surface, useSurface } from '../Surface';
import {
  ancestorsOf,
  canContain,
  dropTarget,
  indexTree,
  isExpandable,
  keyboardMove,
  nextByLetter,
  visibleRows,
  zoneAt,
  type DropTarget,
  type KeyboardMove,
  type LoadState,
  type TreeRow as Row,
} from './model';
import { TreeNote, TreeRow, type RowControls } from './TreeRow';
import type { TreeMoveTarget, TreeNode, TreeProps } from './types';
import { useMoveAnimation } from './useMoveAnimation';
import { ROW_ATTR, useTreeDrag } from './useTreeDrag';
import { raw } from '../../tokens';
import styles from './Tree.module.scss';

type NodeRow = Extract<Row, { kind: 'node' }>;

/** A loaded list is `done` until its children are in `nodes`: it is not asked for twice. */
type Load = LoadState | 'done';

const isNodeRow = (row: Row): row is NodeRow => row.kind === 'node';

const MOVE_KEYS: Record<string, KeyboardMove> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowRight: 'in',
  ArrowLeft: 'out',
};

const isMenuKey = (event: React.KeyboardEvent) =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

const openInNewTab = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

/**
 * A hierarchy with expanding, a cursor, renaming and moving (spec: Tree) — the
 * page tree of the sidebar, so it behaves like a file manager. It knows
 * nothing about pages: it gets nodes and gives back events.
 *
 * One Tab stop for the whole tree: focus stays on it and points at the cursor
 * row (aria-activedescendant); the rows' buttons are for the mouse. The open
 * page and the cursor are two different states and may be on different rows.
 */
export const Tree: React.FC<TreeProps> = ({
  nodes,
  expanded,
  onExpandedChange,
  activeId,
  loadChildren,
  onRename,
  onMove,
  actions,
  onAdd,
  onRetry,
  'aria-label': ariaLabel,
  className,
  ref,
}) => {
  const messages = useMessages();
  const surface = useSurface();
  const router = useRouter();
  const baseId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<ContextMenuHandle>(null);
  const [loads, setLoads] = useState<ReadonlyMap<string, Load>>(() => new Map());
  const [cursorId, setCursorId] = useState<string | undefined>(activeId);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [menuNodeId, setMenuNodeId] = useState<string | null>(null);
  /** The cursor moved from the keyboard: bring its row into view. */
  const revealCursor = useRef(false);
  const lastCursorIndex = useRef(0);
  const mounted = useRef(true);

  const index = useMemo(() => indexTree(nodes), [nodes]);
  const rows = useMemo(
    () => visibleRows(nodes, expanded, (id) => (loads.get(id) === 'failed' ? 'failed' : undefined)),
    [nodes, expanded, loads],
  );
  const nodeRows = useMemo(() => rows.filter(isNodeRow), [rows]);
  const rowById = useMemo(() => new Map(nodeRows.map((row) => [row.node.id, row])), [nodeRows]);

  const domIdOf = (id: string) => `${baseId}-${id}`;
  const elementOf = (id: string) => document.getElementById(domIdOf(id));

  // The cursor never gets lost (philosophy 05): hidden by a collapse — to the
  // nearest visible ancestor; gone — to the row that took its place.
  const cursor = (() => {
    if (cursorId !== undefined) {
      if (rowById.has(cursorId)) {
        return cursorId;
      }

      const ancestor = ancestorsOf(index, cursorId)
        .reverse()
        .find((id) => rowById.has(id));

      if (ancestor) {
        return ancestor;
      }
    }

    if (activeId !== undefined && rowById.has(activeId)) {
      return activeId;
    }

    return nodeRows[Math.min(lastCursorIndex.current, nodeRows.length - 1)]?.node.id;
  })();

  useLayoutEffect(() => {
    const position = nodeRows.findIndex((row) => row.node.id === cursor);

    if (position >= 0) {
      lastCursorIndex.current = position;
    }

    if (revealCursor.current && cursor !== undefined) {
      revealCursor.current = false;
      elementOf(cursor)?.scrollIntoView?.({ block: 'nearest' });
    }
  });

  const setOpen = (ids: string[], open: boolean) => {
    const next = new Set(expanded);

    for (const id of ids) {
      if (open) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }

    onExpandedChange(next);
  };

  // ── Lazy children ────────────────────────────────────────────────
  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let next: Map<string, Load> | null = null;
    const edit = () => (next ??= new Map(loads));

    // Loaded lists that are now in the data are forgotten: a later invalidation loads again.
    for (const id of loads.keys()) {
      if (index.get(id)?.node.children !== undefined) {
        edit().delete(id);
      }
    }

    for (const row of nodeRows) {
      const { id } = row.node;

      if (row.expanded && row.node.children === undefined && !loads.has(id) && loadChildren) {
        edit().set(id, 'pending');

        loadChildren(id).then(
          () => mounted.current && setLoads((state) => new Map(state).set(id, 'done')),
          () => mounted.current && setLoads((state) => new Map(state).set(id, 'failed')),
        );
      }
    }

    if (next) {
      setLoads(next);
    }
  }, [nodeRows, index]);

  const retryLoad = (id: string) =>
    setLoads((state) => {
      const next = new Map(state);

      next.delete(id);

      return next;
    });

  // ── The open page ────────────────────────────────────────────────
  // Always visible: its ancestors open, its row scrolled into view by the least shift.
  const activeAncestors = activeId === undefined ? [] : ancestorsOf(index, activeId);
  const activeAncestorsKey = activeAncestors.join('\u0000');

  useEffect(() => {
    const closed = activeAncestors.filter((id) => !expanded.has(id));

    if (closed.length > 0) {
      setOpen(closed, true);
    }
  }, [activeId, activeAncestorsKey]);

  const revealedActive = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    if (activeId !== undefined && revealedActive.current !== activeId && rowById.has(activeId)) {
      revealedActive.current = activeId;
      elementOf(activeId)?.scrollIntoView?.({ block: 'nearest' });
    }
  });

  // Opened from elsewhere (a link, the palette): the cursor follows, unless the tree is being worked in.
  useEffect(() => {
    if (activeId !== undefined && !containerRef.current?.contains(document.activeElement)) {
      setCursorId(activeId);
    }
  }, [activeId]);

  // ── Actions ──────────────────────────────────────────────────────
  const openNode = (node: TreeNode, newTab = false) => {
    if (!node.href) {
      if (isExpandable(node)) {
        setOpen([node.id], !expanded.has(node.id));
      }
    } else if (newTab) {
      openInNewTab(node.href);
    } else if (router) {
      router.navigate(node.href);
    } else {
      window.location.assign(node.href);
    }
  };

  const animateMove = useMoveAnimation(containerRef, rows);

  const move = (id: string, to: TreeMoveTarget, expand?: string) => {
    animateMove();

    // The new parent opens, so the moved node stays in view.
    if (expand !== undefined && !expanded.has(expand)) {
      setOpen([expand], true);
    }

    onMove?.(id, to);
  };

  const openMenu = (id: string, anchor: HTMLElement | null) => {
    if (!actions || !anchor) {
      return;
    }

    setMenuNodeId(id);
    menuRef.current?.openAt(anchor, containerRef.current ?? undefined);
  };

  const moveCursor = (id: string | undefined) => {
    if (id !== undefined) {
      revealCursor.current = true;
      setCursorId(id);
    }
  };

  const drag = useTreeDrag({
    containerRef,
    targetAt: (draggedId, rowId, fraction) => {
      const row = rowById.get(rowId);

      return row ? dropTarget(nodes, index, row, zoneAt(fraction, canContain(row.node)), draggedId) : null;
    },
    opensOnHover: (rowId) => {
      const row = rowById.get(rowId);

      return row !== undefined && isExpandable(row.node) && !row.expanded;
    },
    expand: (rowId) => setOpen([rowId], true),
    drop: (id, target: DropTarget) =>
      move(id, target.move, target.line === null ? (target.move.parentId ?? undefined) : undefined),
  });

  const controls = useRef<RowControls>(null as unknown as RowControls);

  controls.current = {
    messages,
    click: (node, event) => {
      setCursorId(node.id);

      // A link handles its own click (the router, a new tab); the rest of the row opens the node.
      if (!(event.target as HTMLElement).closest('a')) {
        openNode(node, event.metaKey || event.ctrlKey);
      }
    },
    toggle: (id) => {
      setCursorId(id);
      setOpen([id], !expanded.has(id));
    },
    pointerDown: (event, node) => {
      if (onMove && node.disabledReason === undefined && renamingId !== node.id) {
        drag.start(event, node.id);
      }
    },
    add: (id) => onAdd?.(id),
    more: (id, anchor) => {
      setCursorId(id);
      openMenu(id, anchor);
    },
    retry: (id) => onRetry?.(id),
    retryLoad,
    renamed: (id, value, byKey) => {
      setRenamingId(null);

      const label = value?.trim();
      const node = index.get(id)?.node;

      // An empty name is not saved (product §4.3); an unchanged one is not a change.
      if (label && node && label !== node.label) {
        onRename?.(id, label);
      }

      // Enter / Esc return to the tree; a click elsewhere keeps focus where it went.
      if (byKey) {
        containerRef.current?.focus({ preventScroll: true });
      }
    },
  };

  useImperativeHandle(ref, () => ({
    rename: (id) => {
      setCursorId(id);
      setRenamingId(id);
    },
    focus: () => containerRef.current?.focus(),
  }));

  // ── Keyboard (spec: Tree · 03) ───────────────────────────────────
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const row = cursor === undefined ? undefined : rowById.get(cursor);

    if (event.target !== event.currentTarget || event.nativeEvent.isComposing || !row) {
      return;
    }

    const { node } = row;
    const mod = detectPlatform() === 'mac' ? event.metaKey : event.ctrlKey;
    const position = nodeRows.indexOf(row);

    const handled = () => {
      event.preventDefault();
      // Taken by the tree: an app hotkey on the same key does not fire too.
      event.stopPropagation();
    };

    if (isMenuKey(event)) {
      if (actions) {
        handled();
        openMenu(node.id, elementOf(node.id));
      }

      return;
    }

    if (mod && MOVE_KEYS[event.key]) {
      handled();

      const target = onMove ? keyboardMove(nodes, index, node.id, MOVE_KEYS[event.key]) : null;

      if (target) {
        revealCursor.current = true;
        move(node.id, { parentId: target.parentId, index: target.index }, target.expand);
      }

      return;
    }

    if (event.altKey || (mod && event.key !== 'Enter')) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        handled();
        moveCursor(nodeRows[Math.min(nodeRows.length - 1, position + 1)]?.node.id);
        break;
      case 'ArrowUp':
        handled();
        moveCursor(nodeRows[Math.max(0, position - 1)]?.node.id);
        break;
      case 'Home':
        handled();
        moveCursor(nodeRows[0]?.node.id);
        break;
      case 'End':
        handled();
        moveCursor(nodeRows[nodeRows.length - 1]?.node.id);
        break;
      case 'ArrowRight': {
        handled();

        if (!isExpandable(node)) {
          break;
        }

        if (!row.expanded) {
          setOpen([node.id], true);
        } else if (loads.get(node.id) === 'failed') {
          retryLoad(node.id);
        } else {
          const next = nodeRows[position + 1];

          if (next?.parentId === node.id) {
            moveCursor(next.node.id);
          }
        }
        break;
      }
      case 'ArrowLeft':
        handled();

        if (row.expanded) {
          setOpen([node.id], false);
        } else if (row.parentId !== null) {
          moveCursor(row.parentId);
        }
        break;
      case 'Enter':
        handled();
        openNode(node, mod);
        break;
      case 'F2':
        if (onRename && node.disabledReason === undefined) {
          handled();
          setRenamingId(node.id);
        }
        break;
      case '*': {
        handled();

        const siblings = row.parentId === null ? nodes : (index.get(row.parentId)?.node.children ?? []);

        setOpen(
          siblings.filter(isExpandable).map((sibling) => sibling.id),
          true,
        );
        break;
      }
      default:
        // A letter jumps to the next node that starts with it — unless the app took the letter.
        if (event.key.length === 1 && event.key.trim() !== '' && !isAppHotkey(event.nativeEvent)) {
          handled();
          moveCursor(nextByLetter(rows, node.id, event.key));
        }
    }
  };

  const menuNode = menuNodeId === null ? undefined : index.get(menuNodeId)?.node;
  const draggedNode = drag.drag ? index.get(drag.drag.id)?.node : undefined;
  const target = drag.drag?.target;

  const tree = (
    <div
      ref={containerRef}
      role="tree"
      aria-label={ariaLabel}
      tabIndex={0}
      aria-activedescendant={cursor === undefined ? undefined : domIdOf(cursor)}
      className={cx(styles.tree, className)}
      data-dragging={drag.drag ? '' : undefined}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        // Focus stays on the tree whatever part of a row is pressed (and no text gets selected).
        if (!(event.target as HTMLElement).closest('input')) {
          event.preventDefault();
          containerRef.current?.focus({ preventScroll: true });
        }
      }}
      onContextMenu={(event) => {
        const element = (event.target as HTMLElement).closest<HTMLElement>(`[${ROW_ATTR}]`);
        const id = element?.getAttribute(ROW_ATTR);

        if (id) {
          // The menu opens at the pointer, for this row.
          setCursorId(id);
          setMenuNodeId(id);
        } else {
          event.preventDefault();
        }
      }}
    >
      {rows.map((row) => {
        if (row.kind !== 'node') {
          return <TreeNote key={`${row.kind}:${row.parentId}`} row={row} controls={controls} />;
        }

        const { id } = row.node;
        const drop = target?.rowId === id ? (target.line ? target.line.edge : 'into') : undefined;

        return (
          <TreeRow
            key={id}
            row={row}
            domId={domIdOf(id)}
            cursor={id === cursor}
            active={id === activeId}
            renaming={id === renamingId}
            dragSource={id === drag.drag?.id}
            drop={drop}
            dropDepth={drop && target?.line ? target.line.depth : undefined}
            canAdd={onAdd !== undefined && canContain(row.node)}
            hasActions={actions !== undefined}
            path={
              row.depth >= raw['tree-max-depth']
                ? [...ancestorsOf(index, id), id].map((part) => index.get(part)?.node.label).join(' / ')
                : undefined
            }
            controls={controls}
          />
        );
      })}
    </div>
  );

  return (
    <>
      {actions ? (
        <ContextMenu ref={menuRef} items={menuNode ? actions(menuNode) : []} aria-label={menuNode?.label}>
          {tree}
        </ContextMenu>
      ) : (
        tree
      )}
      {drag.drag &&
        draggedNode &&
        createPortal(
          // The lifted row keeps the tree's surface: the portal is out of reach of CSS inheritance.
          <Surface tone={surface} asChild>
            <div ref={drag.ghostRef} className={styles.ghost} style={{ width: drag.drag.width }} aria-hidden="true">
              {draggedNode.icon !== undefined && <span className={styles.icon}>{draggedNode.icon}</span>}
              <span className={styles.label}>{draggedNode.label}</span>
            </div>
          </Surface>,
          document.body,
        )}
    </>
  );
};
