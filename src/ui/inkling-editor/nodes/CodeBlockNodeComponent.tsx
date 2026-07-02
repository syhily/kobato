import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { CodeBlockCard } from '@/ui/inkling-editor/components/ui/cards/CodeBlockCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { $isCodeBlockNode } from '@/ui/inkling-editor/nodes/CodeBlockNode'

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
  const [editor] = useLexicalComposerContext()
  const { cardConfig } = React.useContext(InklingComposerContext)
  const { isEditing, isSelected } = React.useContext(CardContext)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState<boolean>(false)

  const updateCode = React.useCallback(
    (value: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isCodeBlockNode(node)) {
          node.code = value
        }
      })
    },
    [editor, nodeKey],
  )

  const updateLanguage = React.useCallback(
    (value: string) => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if ($isCodeBlockNode(node)) {
          node.language = value
        }
      })
    },
    [editor, nodeKey],
  )

  const handleToolbarEdit = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      <CodeBlockCard
        captionEditor={captionEditor ?? null}
        captionEditorInitialState={captionEditorInitialState}
        code={code}
        isEditing={isEditing}
        isSelected={isSelected}
        language={language}
        updateCode={updateCode}
        updateLanguage={updateLanguage}
      />
      <ActionToolbar data-inkling-card-toolbar="code-block" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>
      <ActionToolbar data-inkling-card-toolbar="code-block" isVisible={isSelected && !isEditing && !showSnippetToolbar}>
        <ToolbarMenu>
          <ToolbarMenuItem
            className={undefined}
            dataTestId="edit-code-block-card"
            icon="edit"
            isActive={false}
            label="Edit"
            onClick={handleToolbarEdit}
          />
          <ToolbarMenuSeparator hide={!cardConfig.createSnippet} />
          <ToolbarMenuItem
            className={undefined}
            dataTestId="create-snippet"
            hide={!cardConfig.createSnippet}
            icon="snippet"
            isActive={false}
            label="Save as snippet"
            onClick={() => setShowSnippetToolbar(true)}
          />
        </ToolbarMenu>
      </ActionToolbar>
    </>
  )
}
