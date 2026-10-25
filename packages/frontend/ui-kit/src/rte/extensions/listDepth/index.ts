import { Extension } from '@tiptap/core';
import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from '@tiptap/pm/state';
import { raw } from '../../../tokens';
import { liftListItem } from '@tiptap/pm/schema-list';
import { Node, NodeType } from '@tiptap/pm/model';

const LISTS = new Set(['bulletList', 'orderedList', 'taskList']);
const ITEMS = new Set(['listItem', 'taskItem']);

export interface ListDepthOptions {
  maxDepth: number;
}

const firstTooDeep = (doc: Node, max: number): { pos: number; type: NodeType } | null => {
  let found: { pos: number; type: NodeType } | null = null;

  doc.descendants((node, pos) => {
    if (found) return false;

    if (!ITEMS.has(node.type.name)) return true;

    const $pos = doc.resolve(pos);

    let depth = 0;

    for (let d = 0; d <= $pos.depth; d++) if (LISTS.has($pos.node(d).type.name)) depth++;

    if (depth > max) found = { pos, type: node.type };

    return !found;
  });

  return found;
};

export const ListDepth = Extension.create<ListDepthOptions>({
  name: 'listDepth',

  addOptions() {
    return {
      maxDepth: raw['doc-max-depth'],
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('listDepth'),
        appendTransaction: (transactions, oldState, newState) => {
          const hasDocChanged = transactions.some((transaction) => transaction.docChanged);

          if (!hasDocChanged) return null;

          const tr = newState.tr;

          let deepItem = firstTooDeep(newState.doc, this.options.maxDepth);

          while (deepItem) {
            const inside = EditorState.create({
              doc: tr.doc,
              selection: TextSelection.near(tr.doc.resolve(deepItem.pos + 1)),
            });

            let lifted: Transaction | null = null;

            liftListItem(deepItem.type)(inside, (t) => (lifted = t));

            if (!lifted) break;

            (lifted as Transaction).steps.forEach((step) => tr.step(step));

            deepItem = firstTooDeep(tr.doc, this.options.maxDepth);
          }

          return tr;
        },
      }),
    ];
  },
});
