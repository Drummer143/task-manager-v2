import { defineDragType } from '../../interaction/dnd';
import type { TreeDragItem } from './types';

/**
 * A dragged tree row, for the app's drop targets and monitors (spec: Tree · 02):
 * `treeItemDrag.is(source.data)`, `treeItemDrag.get(source.data)?.node`.
 */
export const treeItemDrag = defineDragType<TreeDragItem>('tree-item');

/** A row's drop target data: which tree, which row. */
export const TREE_KEY = 'tree';
export const ROW_KEY = 'tree-row';

/** The data attribute every node row carries: its id. */
export const ROW_ATTR = 'data-tree-row';

/** What a row gives other apps and the browser when dragged out: its page's address (text/uri-list). */
export const externalDataOf = (href: string | undefined): Record<string, string> => {
  if (href === undefined) {
    return {};
  }

  const url = new URL(href, window.location.href).href;

  return { 'text/uri-list': url, 'text/plain': url };
};
