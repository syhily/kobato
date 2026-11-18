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

/**
 * Toggle's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@kobato/inkling-internal/nodes/cards/card-decorate`.
 */
export function renderToggleCard(node: ToggleNode) {
  // Same headless-round-trip invariant as callout's nested editor: null only
  // inside the headless markdown round-trip editor, which never reconciles
  // decorators — guard so the field type stays honest.
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
