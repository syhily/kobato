import type { CodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import { CodeBlockCard } from '@kobato/inkling-internal/components/ui/cards/CodeBlockCard'
import { useCardIsEditing, useCardIsSelected } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import InklingUiPrefsContext from '@kobato/inkling-internal/context/InklingUiPrefsContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { useReselectOnEscape } from '@kobato/inkling-internal/hooks/useReselectOnEscape'
import { $isCodeBlockNode } from '@kobato/inkling-internal/nodes/CodeBlockNode'
import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

export interface CodeBlockNodeComponentProps {
  nodeKey: NodeKey
  code?: string
  language?: string
  captionEditor?: LexicalEditor | null
  captionEditorInitialState?: EditorState | undefined
}

export function CodeBlockNodeComponent({
  nodeKey,
  code,
  language,
  captionEditor,
  captionEditorInitialState,
}: CodeBlockNodeComponentProps) {
  const { setField } = useCardChrome(nodeKey, $isCodeBlockNode)
  const { darkMode } = React.useContext(InklingUiPrefsContext)
  const isSelected = useCardIsSelected(nodeKey)
  const isEditing = useCardIsEditing(nodeKey)
  const exitEditMode = useReselectOnEscape(nodeKey)

  const updateCode = setField('code')

  const updateLanguage = setField('language')

  return (
    <>
      <CodeBlockCard
        captionEditor={captionEditor ?? null}
        captionEditorInitialState={captionEditorInitialState}
        code={code}
        darkMode={darkMode}
        isEditing={isEditing}
        isSelected={isSelected}
        language={language}
        updateCode={updateCode}
        updateLanguage={updateLanguage}
        onEscape={exitEditMode}
      />
      <CardActionToolbar editDataTestId="edit-code-block-card" nodeKey={nodeKey} />
    </>
  )
}

/**
 * CodeBlock's decorate render — the React-bearing half of its
 * decorate-target, paired with the declaration by
 * `@kobato/inkling-internal/nodes/cards/card-decorate`.
 */
export function renderCodeBlockCard(node: CodeBlockNode) {
  return (
    <CodeBlockNodeComponent
      captionEditor={node.__captionEditor}
      captionEditorInitialState={node.__captionEditorInitialState}
      code={node.code}
      language={node.language}
      nodeKey={node.getKey()}
    />
  )
}
