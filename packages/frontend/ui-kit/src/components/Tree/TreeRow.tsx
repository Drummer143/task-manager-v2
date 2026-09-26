import React, { memo, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from '../../icons';
import type { KitMessages } from '../../messages';
import { useLinkClick, useLinkHref } from '../../router';
import { skeletonWidth, Skeleton } from '../States';
import { tooltipProps } from '../Tooltip';
import { isExpandable, type TreeRow as Row } from './model';
import type { TreeNode } from './types';
import { ROW_ATTR } from './useTreeDrag';
import styles from './Tree.module.scss';

type NodeRow = Extract<Row, { kind: 'node' }>;

/** What a row may ask of the tree. One object for all rows, read at call time: rows re-render only for their own state. */
export interface RowControls {
  messages: KitMessages;
  /** Anything on the row except its buttons and link: the cursor, and opening the node. */
  click(node: TreeNode, event: React.MouseEvent<HTMLElement>): void;
  toggle(id: string): void;
  pointerDown(event: React.PointerEvent<HTMLElement>, node: TreeNode): void;
  add(id: string): void;
  more(id: string, anchor: HTMLElement): void;
  retry(id: string): void;
  retryLoad(id: string): void;
  /** The end of a rename: the new text, or null (Esc); `byKey` — Enter/Esc, not a blur. */
  renamed(id: string, value: string | null, byKey: boolean): void;
}

type DropMark = 'into' | 'top' | 'bottom';

export interface TreeRowProps {
  row: NodeRow;
  domId: string;
  cursor: boolean;
  active: boolean;
  renaming: boolean;
  dragSource: boolean;
  drop?: DropMark;
  dropDepth?: number;
  canAdd: boolean;
  hasActions: boolean;
  /** Deeper than the indent goes: where the node is, for the tooltip. */
  path?: string;
  controls: React.RefObject<RowControls>;
}

type DepthStyle = React.CSSProperties & {
  '--_depth'?: number;
  '--_line-depth'?: number;
};

/** A tree-only button: never a Tab stop — the tree has one (spec: Tree · 03); the mouse keeps focus on the tree. */
const RowButton: React.FC<{
  className: string;
  label?: string;
  leaf?: boolean;
  onPress(event: React.MouseEvent<HTMLButtonElement>): void;
  children: React.ReactNode;
}> = ({ className, label, leaf, onPress, children }) => (
  <button
    type="button"
    tabIndex={-1}
    aria-hidden="true"
    className={className}
    data-leaf={leaf || undefined}
    onClick={(event) => {
      event.stopPropagation();
      onPress(event);
    }}
    {...(label ? tooltipProps({ text: label }) : {})}
  >
    {children}
  </button>
);

const RenameField: React.FC<{
  initial: string;
  label: string;
  onDone(value: string | null, byKey: boolean): void;
}> = ({ initial, label, onDone }) => {
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  const finish = (value: string | null, byKey: boolean) => {
    if (!done.current) {
      done.current = true;
      onDone(value, byKey);
    }
  };

  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      className={styles.rename}
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        // The field's keys are the field's: neither the tree nor the Esc ladder sees them.
        event.stopPropagation();

        if (event.nativeEvent.isComposing) {
          return;
        }

        if (event.key === 'Enter') {
          event.preventDefault();
          finish(draft, true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(null, true);
        }
      }}
      onBlur={() => finish(draft, false)}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
};

/** The text part of the row: a real link when the node has a page, so middle and mod clicks open a tab. */
const NodeLink: React.FC<{ node: TreeNode; children: React.ReactNode }> = ({ node, children }) => {
  const href = useLinkHref(node.href as string);
  const onClick = useLinkClick({ href: node.href });

  return (
    <a href={href} className={styles.main} tabIndex={-1} draggable={false} onClick={onClick}>
      {children}
    </a>
  );
};

/**
 * One node (spec: Tree · 01): the chevron (an empty place of the same width
 * for a leaf), the type icon, the name, and at the right the counter — or,
 * on hover and on the cursor, the actions.
 */
export const TreeRow: React.FC<TreeRowProps> = memo(
  ({ row, domId, cursor, active, renaming, dragSource, drop, dropDepth, canAdd, hasActions, path, controls }) => {
    const { node, depth, expanded } = row;
    const expandable = isExpandable(node);
    const locked = node.disabledReason !== undefined;
    const messages = controls.current.messages;
    const meta = locked ? messages.treeNoAccess : node.meta;
    const showActions = (canAdd || hasActions) && !renaming;

    // One tooltip per row: why it is closed, what failed, where a deep node is; otherwise the full name if cut.
    const rowTooltip = node.error
      ? tooltipProps({ text: node.error })
      : locked
        ? tooltipProps({ reason: node.disabledReason as string })
        : path
          ? tooltipProps({ text: path })
          : {};
    const labelTooltip = node.error || locked || path ? {} : tooltipProps({ overflow: true });

    const content = (
      <>
        {node.icon !== undefined && <span className={styles.icon}>{node.icon}</span>}
        <span className={styles.label} {...labelTooltip}>
          {node.label}
        </span>
        {meta && !node.error && <span className={styles.meta}>{meta}</span>}
      </>
    );

    return (
      <div
        id={domId}
        role="treeitem"
        aria-level={depth + 1}
        aria-posinset={row.index + 1}
        aria-setsize={row.setSize}
        aria-expanded={expandable ? expanded : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={node.label}
        className={styles.row}
        style={{ '--_depth': depth, '--_line-depth': dropDepth } as DepthStyle}
        {...{ [ROW_ATTR]: node.id }}
        data-cursor={cursor || undefined}
        data-active={active || undefined}
        data-locked={locked || undefined}
        data-error={node.error ? '' : undefined}
        data-has-actions={showActions || undefined}
        data-drag-source={dragSource || undefined}
        data-drop={drop === 'into' ? 'into' : undefined}
        onClick={(event) => controls.current.click(node, event)}
        onPointerDown={(event) => controls.current.pointerDown(event, node)}
        {...rowTooltip}
      >
        <RowButton className={styles.tool} leaf={!expandable} onPress={() => controls.current.toggle(node.id)}>
          {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </RowButton>

        {renaming ? (
          <span className={styles.main}>
            {node.icon !== undefined && <span className={styles.icon}>{node.icon}</span>}
            <RenameField
              initial={node.label}
              label={messages.treeRename}
              onDone={(value, byKey) => controls.current.renamed(node.id, value, byKey)}
            />
          </span>
        ) : node.href ? (
          <NodeLink node={node}>{content}</NodeLink>
        ) : (
          <span className={styles.main}>{content}</span>
        )}

        {node.error && !renaming && (
          <button
            type="button"
            tabIndex={-1}
            className={styles.retry}
            onClick={(event) => {
              event.stopPropagation();
              controls.current.retry(node.id);
            }}
          >
            {messages.retry}
          </button>
        )}

        {showActions && (
          <span className={styles.actions}>
            {canAdd && (
              <RowButton className={styles.tool} label={messages.treeAdd} onPress={() => controls.current.add(node.id)}>
                <PlusIcon />
              </RowButton>
            )}
            {hasActions && (
              <RowButton
                className={styles.tool}
                label={messages.treeMore}
                onPress={(event) => controls.current.more(node.id, event.currentTarget)}
              >
                <MoreHorizontalIcon />
              </RowButton>
            )}
          </span>
        )}

        {(drop === 'top' || drop === 'bottom') && <span className={styles.dropLine} data-edge={drop} />}
      </div>
    );
  },
);

TreeRow.displayName = 'TreeRow';

/** A line under an expanded node that has no nodes to show: loading, failed, empty. */
export const TreeNote: React.FC<{
  row: Exclude<Row, { kind: 'node' }>;
  controls: React.RefObject<RowControls>;
}> = ({ row, controls }) => {
  const { messages } = controls.current;
  const style = { '--_depth': row.depth } as DepthStyle;

  if (row.kind === 'loading') {
    return (
      <div role="none" style={style}>
        {/* After 200 ms, one pulse, then still — like every skeleton (spec: Tree · animations). */}
        <Skeleton>
          <span className={styles.note}>
            <Skeleton.Line sunken width={skeletonWidth(1)} />
          </span>
          <span className={styles.note}>
            <Skeleton.Line sunken width={skeletonWidth(3)} />
          </span>
        </Skeleton>
      </div>
    );
  }

  return (
    <div role="none" className={styles.note} style={style}>
      {row.kind === 'empty' ? (
        messages.treeEmpty
      ) : (
        <>
          <span>{messages.treeLoadFailed}</span>
          <button
            type="button"
            tabIndex={-1}
            className={styles.retry}
            onClick={(event) => {
              event.stopPropagation();
              controls.current.retryLoad(row.parentId);
            }}
          >
            {messages.retry}
          </button>
        </>
      )}
    </div>
  );
};
