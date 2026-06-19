import type { InitialConfigType } from '@lexical/react/LexicalComposer'
import type { EditorState, SerializedEditorState, SerializedLexicalNode } from 'lexical'

import { LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { LexicalNestedComposer } from '@lexical/react/LexicalNestedComposer'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { createEditor, ParagraphNode } from 'lexical'
import { useCallback, useMemo } from 'react'

import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

const NESTED_EDITOR_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
]

function toSerializedLexicalChildren(blocks: readonly InklingNonRecursiveBlockNode[]): SerializedLexicalNode[] {
  // Inkling non-recursive blocks are structurally compatible with Lexical serialized nodes
  // for the restricted subset registered above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return structuredClone(blocks) as unknown as SerializedLexicalNode[]
}

function buildNestedInitialState(blocks: readonly InklingNonRecursiveBlockNode[]): EditorState {
  const editor = createEditor({ nodes: NESTED_EDITOR_NODES })
  const root: SerializedEditorState['root'] = {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: toSerializedLexicalChildren(blocks),
  }
  return editor.parseEditorState({ root })
}

export interface NestedInklingEditorProps {
  initialBlocks: readonly InklingNonRecursiveBlockNode[]
  onChange: (blocks: InklingNonRecursiveBlockNode[]) => void
  editable?: boolean
  placeholder?: string
  className?: string
}

export function NestedInklingEditor({ initialBlocks, onChange, editable = true, className }: NestedInklingEditorProps) {
  const [parentEditor] = useLexicalComposerContext()

  const nestedEditor = useMemo(() => {
    // Shared history integration: use LexicalNestedComposer with parentEditor
    // reference. The SharedHistoryProvider in the parent tree ensures nested
    // and root editors share one undo/redo stack. See SharedHistoryContext.tsx.
    return createEditor({
      namespace: 'inkling-nested-editor',
      nodes: NESTED_EDITOR_NODES,
      parentEditor,
      editable,
      theme: {
        paragraph: 'inkling-paragraph',
        heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
        list: { ul: 'inkling-ul', ol: 'inkling-ol' },
        link: 'inkling-link',
      },
      onError: (error: Error) => {
        // eslint-disable-next-line no-console
        console.error('Nested Inkling editor error:', error)
      },
      editorState: buildNestedInitialState(initialBlocks),
    })
  }, [parentEditor, initialBlocks, editable])

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const serialized = editorState.toJSON()
      // Nested editor only registers the restricted subset, so the serialized
      // children are safe to treat as Inkling non-recursive blocks.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const blocks = (serialized.root.children ?? []) as unknown as InklingNonRecursiveBlockNode[]
      onChange(blocks)
    },
    [onChange],
  )

  return (
    <LexicalNestedComposer initialEditor={nestedEditor}>
      <div className={className ?? 'inkling-nested-editor'}>
        <ContentEditable className="inkling-nested-editor__content" />
        <OnChangePlugin onChange={handleChange} />
        <HistoryPlugin />
      </div>
    </LexicalNestedComposer>
  )
}
