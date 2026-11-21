import type { FootnoteDefinitionNode } from '@kobato/inkling-internal/nodes/FootnoteDefinitionNode'
import type { EditorState, LexicalEditor, NodeKey } from 'lexical'

import InklingNestedEditor from '@kobato/inkling-internal/components/InklingNestedEditor'
import { useFootnoteHandle, useFootnoteHandleState } from '@kobato/inkling-internal/context/FootnoteHandleContext'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { $removeFootnote } from '@kobato/inkling-internal/plugins/behaviour/footnotes'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import React from 'react'

export interface FootnoteDefinitionNodeComponentProps {
  nodeKey: NodeKey
  targetKey: string
  contentEditor: LexicalEditor
  contentEditorInitialState?: EditorState | undefined
}

export function FootnoteDefinitionNodeComponent({
  targetKey,
  contentEditor,
  contentEditorInitialState,
}: FootnoteDefinitionNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const footnoteHandle = useFootnoteHandle()
  const labels = useInklingLabels()
  const index = useFootnoteHandleState((state) => state.indices[targetKey] ?? 0)
  const focusRequest = useFootnoteHandleState((state) => state.focusRequest)

  React.useEffect(() => {
    if (focusRequest?.targetKey !== targetKey) {
      return
    }
    contentEditor.focus(() => undefined, { defaultSelection: 'rootEnd' })
    footnoteHandle.setState({ focusRequest: null })
  }, [focusRequest, targetKey, contentEditor, footnoteHandle])
  const handleDelete = React.useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      editor.update(() => {
        $removeFootnote(targetKey)
      })
    },
    [editor, targetKey],
  )

  return (
    <div className="inkling-footnote-definition flex items-baseline gap-2" data-inkling-footnote-definition="true">
      <span
        className="inkling-footnote-definition-index text-grey-500 shrink-0 text-sm"
        data-inkling-footnote-definition-index="true"
      >
        {index}.
      </span>
      <div className="inkling-footnote-definition-content w-full">
        <InklingNestedEditor
          dataTestId="footnote-definition-content"
          initialEditor={contentEditor}
          initialEditorState={contentEditorInitialState}
          nodes="basic"
          placeholderText={labels['footnote.content.placeholder']}
        />
      </div>
      <button
        aria-label={labels['aria.deleteFootnote']}
        className="inkling-footnote-definition-delete text-grey-400 hover:text-grey-700 dark:hover:text-grey-200 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded"
        data-inkling-allow-clickthrough="true"
        data-inkling-footnote-definition-delete="true"
        onClick={handleDelete}
        type="button"
      >
        ×
      </button>
    </div>
  )
}

export function renderFootnoteDefinitionCard(node: FootnoteDefinitionNode) {
  if (!node.__contentEditor) {
    return null
  }
  return (
    <FootnoteDefinitionNodeComponent
      contentEditor={node.__contentEditor}
      contentEditorInitialState={node.__contentEditorInitialState}
      nodeKey={node.getKey()}
      targetKey={node.targetKey}
    />
  )
}
