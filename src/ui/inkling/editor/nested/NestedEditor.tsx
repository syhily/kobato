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
import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { InklingNonRecursiveBlockNode } from '@/shared/inkling/schema'

import { InlineMathNode } from '@/ui/inkling/editor/article/InlineMathNode'
import {
  CodeCardNode,
  HorizontalRuleCardNode,
  ImageCardNode,
  MathCardNode,
  TableCardNode,
} from '@/ui/inkling/editor/cards/simple-card-nodes'
import { reportEditorError } from '@/ui/inkling/editor/error-report'
import { useOptionalSharedHistoryState } from '@/ui/inkling/editor/nested/SharedHistoryContext'

export const NESTED_ARTICLE_NODES: InitialConfigType['nodes'] = [
  ParagraphNode,
  HeadingNode,
  QuoteNode,
  ListNode,
  ListItemNode,
  LinkNode,
  InlineMathNode,
  ImageCardNode,
  CodeCardNode,
  MathCardNode,
  HorizontalRuleCardNode,
  TableCardNode,
]

function toSerializedLexicalChildren(blocks: readonly InklingNonRecursiveBlockNode[]): SerializedLexicalNode[] {
  // Inkling non-recursive blocks are structurally compatible with Lexical serialized nodes
  // for the restricted subset registered above.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return structuredClone(blocks) as unknown as SerializedLexicalNode[]
}

function buildNestedInitialState(blocks: readonly InklingNonRecursiveBlockNode[]): EditorState {
  const editor = createEditor({ nodes: NESTED_ARTICLE_NODES })
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
  nodes?: InitialConfigType['nodes']
}

export function NestedInklingEditor({
  initialBlocks,
  onChange,
  editable = true,
  className,
  nodes = NESTED_ARTICLE_NODES,
}: NestedInklingEditorProps) {
  const [parentEditor] = useLexicalComposerContext()
  const sharedHistoryState = useOptionalSharedHistoryState()

  const nestedEditor = useMemo(() => {
    return createEditor({
      namespace: 'inkling-nested-editor',
      nodes,
      parentEditor,
      editable,
      theme: {
        paragraph: 'inkling-paragraph',
        heading: { h1: 'inkling-h1', h2: 'inkling-h2', h3: 'inkling-h3', h4: 'inkling-h4' },
        list: { ul: 'inkling-ul', ol: 'inkling-ol' },
        link: 'inkling-link',
      },
      onError: (error: Error) => {
        reportEditorError(error, 'nested')
      },
    })
    // initialBlocks is intentionally excluded from deps — recreating the editor
    // on every keystroke destroys selection, focus, and undo history.  The
    // editor is created once and seeded via the effect below.  External state
    // changes (e.g. adopting a different revision) are handled by the parent
    // remounting this component with a new key.
  }, [parentEditor, nodes, editable])

  // Seed the initial editor state once on mount.  Subsequent renders with a
  // new initialBlocks identity (from our own onChange → parent setChildren →
  // Lexical re-decorate loop) must NOT re-seed, or we'd overwrite the user's
  // selection.  External state changes are picked up by the parent remounting
  // this component (e.g. via key={documentKey} in InklingArticleEditor).
  const didInitRef = useRef(false)
  useEffect(() => {
    if (!didInitRef.current) {
      nestedEditor.setEditorState(buildNestedInitialState(initialBlocks))
      didInitRef.current = true
    }
  }, [nestedEditor, initialBlocks])

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
        <HistoryPlugin externalHistoryState={sharedHistoryState ?? undefined} />
      </div>
    </LexicalNestedComposer>
  )
}
