import { Document } from '@tiptap/extension-document';
import { Text } from '@tiptap/extension-text';
import { Placeholder, UndoRedo } from '@tiptap/extensions';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Heading } from '@tiptap/extension-heading';
import { BulletList, OrderedList, TaskList, TaskItem, ListItem } from '@tiptap/extension-list';
import { Blockquote } from '@tiptap/extension-blockquote';
import { CodeBlock } from '@tiptap/extension-code-block';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Code } from '@tiptap/extension-code';
import { Link } from '@tiptap/extension-link';
import { Gapcursor } from '@tiptap/extension-gapcursor';
import { Dropcursor } from '@tiptap/extension-dropcursor';
import { raw } from '../tokens';
import { ResolvedPos } from '@tiptap/pm/model';
import { RTEContext } from './types';
import styles from './RTEEditor.module.scss';
import { ListDepth } from './extensions/listDepth';
import { KitMessages } from '../messages';

const LIST_ITEMS = new Set(['listItem', 'taskItem']);

const listDepth = ($pos: ResolvedPos) => {
  let depth = 0;
  for (let d = $pos.depth; d > 0; d--) if (LIST_ITEMS.has($pos.node(d).type.name)) depth++;
  return depth;
};

export const getExtensions = (context: RTEContext, messages: KitMessages) => [
  // Main
  Document,
  Text,
  UndoRedo,

  // Part 1
  Paragraph,
  Heading.configure({ levels: [1, 2, 3] }),
  BulletList,
  OrderedList,
  ListItem.extend({
    addKeyboardShortcuts() {
      return {
        ...this.parent?.(),
        Tab: () =>
          listDepth(this.editor.state.selection.$from) >= raw['doc-max-depth']
            ? true
            : this.editor.commands.sinkListItem(this.name),
      };
    },
  }),
  TaskList,
  TaskItem.configure({ nested: true }).extend({
    addKeyboardShortcuts() {
      return {
        ...this.parent?.(),
        Tab: () =>
          listDepth(this.editor.state.selection.$from) >= raw['doc-max-depth']
            ? true
            : this.editor.commands.sinkListItem(this.name),
      };
    },
  }),
  ListDepth,
  Blockquote,
  CodeBlock,
  ...(context === 'comment' ? [] : [HorizontalRule]),
  HardBreak,

  Code,
  Link,

  Placeholder.configure({
    includeChildren: true,
    placeholder: (props) => {
      switch (props.node.type.name) {
        case 'heading':
          switch (props.node.attrs.level) {
            case 2:
              return messages.heading2Placeholder;
            case 3:
              return messages.heading3Placeholder;
            case 1:
            default:
              return messages.heading1Placeholder;
          }
      }

      switch (context) {
        case 'page':
          return messages.pagePlaceholder;
        case 'comment':
          return messages.commentPlaceholder;
        case 'description':
          return messages.descriptionPlaceholder;
      }
    },
  }),
  Gapcursor,
  // RTE 1a §14: the kit's insertion line. `color: false` leaves the color to the class (an
  // inline one would win); the class is the module's, hashed
  Dropcursor.configure({ color: false, width: 2, class: styles['vr-drop'] }),
];
