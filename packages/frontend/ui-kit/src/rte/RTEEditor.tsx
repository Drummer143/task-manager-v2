import React from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import styles from './RTEEditor.module.scss';

import { RTEContext } from './types';
import { getExtensions } from './getExtensions';
import { useMessages } from '../messages';

interface RTEEditorProps {
  context?: RTEContext;
}

const RTEEditor: React.FC<RTEEditorProps> = ({ context = 'page' }) => {
  const messages = useMessages();

  const editor = useEditor({
    editable: true,
    editorProps: {
      attributes: {
        class: styles['vr-doc'],
        'data-doc-context': context,
        style: `--_ph-list: ${JSON.stringify(messages.listPlaceholder)}; --_ph-quote: ${JSON.stringify(messages.quotePlaceholder)}; --_ph-todo: ${JSON.stringify(messages.todoPlaceholder)}`,
      },
    },
    extensions: getExtensions(context, messages),
  });

  return <EditorContent editor={editor} />;
};

export default RTEEditor;
