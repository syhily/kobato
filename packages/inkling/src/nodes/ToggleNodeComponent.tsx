import type { ToggleNode } from '@kobato/inkling-internal/nodes/ToggleNode'
import type { EditorState, LexicalEditor } from 'lexical'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { ToggleCard } from '@kobato/inkling-internal/components/ui/cards/ToggleCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import React from 'react'

export function ToggleNodeComponent({
  nodeKey,
  headingEditor,
  headingEditorInitialState,
  contentEditor,
  contentEditorInitialState,
}: {
  nodeKey: string
  headingEditor: LexicalEditor
  headingEditorInitialState?: EditorState
  contentEditor: LexicalEditor
  contentEditorInitialState?: EditorState
}) {
  const isEditing = useCardIsEditing(nodeKey)

  React.useEffect(() => {
    headingEditor.setEditable(isEditing)
    contentEditor.setEditable(isEditing)
  }, [isEditing, headingEditor, contentEditor])

  return (
    <>
      <ToggleCard
        contentEditor={contentEditor}
        contentEditorInitialState={contentEditorInitialState}
        headingEditor={headingEditor}
        headingEditorInitialState={headingEditorInitialState}
        isEditing={isEditing}
      />

      <CardActionToolbar nodeKey={nodeKey} />
    </>
  )
}

export function renderToggleCard(node: ToggleNode) {
  if (!node.__titleEditor || !node.__contentEditor) {
    return null
  }

  return (
    <ToggleNodeComponent
      contentEditor={node.__contentEditor}
      contentEditorInitialState={node.__contentEditorInitialState}
      headingEditor={node.__titleEditor}
      headingEditorInitialState={node.__titleEditorInitialState}
      nodeKey={node.getKey()}
    />
  )
}
