import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'

import { LinkNode } from '@lexical/link'
import { ListNode, ListItemNode } from '@lexical/list'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableNode, TableCellNode, TableRowNode } from '@lexical/table'
import { ParagraphNode } from 'lexical'
import { useCallback } from 'react'

import { PocCardNode } from '@/ui/inkling/poc/PocCardNode'

export interface LexicalRuntimeProbeProps {
  initialEditorState: SerializedEditorState
  onChange: (editorState: SerializedEditorState) => void
}

const theme = {
  paragraph: 'inkling-paragraph',
  heading: {
    h1: 'inkling-h1',
    h2: 'inkling-h2',
    h3: 'inkling-h3',
    h4: 'inkling-h4',
  },
  list: {
    ul: 'inkling-ul',
    ol: 'inkling-ol',
  },
  link: 'inkling-link',
}

export function LexicalRuntimeProbe({ initialEditorState, onChange }: LexicalRuntimeProbeProps) {
  const initialConfig: InitialConfigType = {
    namespace: 'inkling-runtime-probe',
    theme,
    onError: (error: Error) => {
      // eslint-disable-next-line no-console
      console.error('Lexical runtime probe error:', error)
    },
    nodes: [
      ParagraphNode,
      HeadingNode,
      QuoteNode,
      ListNode,
      ListItemNode,
      LinkNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      PocCardNode,
    ],
    editorState: (editor: LexicalEditor) => {
      editor.setEditorState(editor.parseEditorState(initialEditorState))
    },
  }

  const handleChange = useCallback(
    (editorState: EditorState) => {
      onChange(editorState.toJSON())
    },
    [onChange],
  )

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="inkling-runtime-probe">
        <ContentEditable className="inkling-content-editable" />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin />
        <AutoFocusPlugin />
      </div>
    </LexicalComposer>
  )
}
