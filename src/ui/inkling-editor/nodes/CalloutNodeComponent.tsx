import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import { ActionToolbar } from '@/ui/inkling-editor/components/ui/ActionToolbar'
import { CalloutCard } from '@/ui/inkling-editor/components/ui/cards/CalloutCard'
import { SnippetCreateToolbar } from '@/ui/inkling-editor/components/ui/SnippetCreateToolbar'
import { ToolbarMenu, ToolbarMenuItem, ToolbarMenuSeparator } from '@/ui/inkling-editor/components/ui/ToolbarMenu'
import CardContext from '@/ui/inkling-editor/context/CardContext'
import InklingComposerContext from '@/ui/inkling-editor/context/InklingComposerContext'
import { GeneratedDecoratorNodeBase } from '@/ui/inkling-editor/nodes/base'

export interface CalloutNodeComponentProps {
  nodeKey: NodeKey
  calloutEmoji?: string
  backgroundColor?: string
  textColor?: string
  calloutTextEditor?: LexicalEditor | null
  calloutTextEditorInitialState?: EditorState | undefined
}

export function CalloutNodeComponent({
  nodeKey,
  calloutEmoji,
  backgroundColor,
  calloutTextEditor,
  calloutTextEditorInitialState,
}: CalloutNodeComponentProps) {
  const [editor] = useLexicalComposerContext()
  const { cardConfig } = React.useContext(InklingComposerContext)
  const { isEditing, isSelected, setEditing } = React.useContext(CardContext)
  const [showSnippetToolbar, setShowSnippetToolbar] = React.useState<boolean>(false)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState<boolean>(false)

  const handleEmojiChange = React.useCallback(
    (newEmoji: string): void => {
      editor.update(() => {
        const node = $getNodeByKey(nodeKey)
        if (node) {
          ;(node as GeneratedDecoratorNodeBase).calloutEmoji = newEmoji
        }
      })
    },
    [editor, nodeKey],
  )

  const handleEmojiSelect = React.useCallback(
    (newEmoji: unknown): void => {
      const nativeEmoji = (newEmoji as { native?: string } | undefined)?.native ?? (newEmoji as string)
      handleEmojiChange(nativeEmoji)
      setShowEmojiPicker(false)
    },
    [handleEmojiChange],
  )

  const handleToggleEmoji = React.useCallback(
    (checked: boolean): void => {
      handleEmojiChange(checked ? calloutEmoji || '💡' : '')
    },
    [calloutEmoji, handleEmojiChange],
  )

  const handleToggleEmojiPicker = React.useCallback((): void => {
    setShowEmojiPicker((show) => !show)
  }, [])

  const handleBackgroundColorChange = (color?: string): void => {
    if (!color) {
      return
    }
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (node) {
        ;(node as GeneratedDecoratorNodeBase).backgroundColor = color
      }
    })
  }

  const handleToolbarEdit = (event: React.MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    setEditing(true)
  }

  return (
    <>
      <CalloutCard
        backgroundColor={backgroundColor}
        calloutEmoji={calloutEmoji}
        changeEmoji={handleEmojiSelect}
        color={backgroundColor as import('@/ui/inkling-editor/components/ui/cards/CalloutCard').CalloutColorName}
        handleColorChange={handleBackgroundColorChange}
        isEditing={isEditing}
        nodeKey={nodeKey}
        setShowEmojiPicker={setShowEmojiPicker}
        showEmojiPicker={showEmojiPicker}
        textEditor={calloutTextEditor!}
        textEditorInitialState={calloutTextEditorInitialState}
        toggleEmoji={handleToggleEmoji}
        toggleEmojiPicker={handleToggleEmojiPicker}
      />
      <ActionToolbar data-inkling-card-toolbar="callout" isVisible={showSnippetToolbar}>
        <SnippetCreateToolbar nodeKey={nodeKey} onClose={() => setShowSnippetToolbar(false)} />
      </ActionToolbar>
      <ActionToolbar data-inkling-card-toolbar="callout" isVisible={isSelected && !isEditing && !showSnippetToolbar}>
        <ToolbarMenu>
          <ToolbarMenuItem
            className={undefined}
            dataTestId="edit-callout-card"
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
