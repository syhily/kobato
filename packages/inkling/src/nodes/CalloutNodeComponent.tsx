import type { CalloutNode } from '@kobato/inkling-internal/nodes/CalloutNode'

import { CardActionToolbar } from '@kobato/inkling-internal/components/ui/CardActionToolbar'
import {
  CALLOUT_COLORS,
  CalloutCard,
  type CalloutColorName,
} from '@kobato/inkling-internal/components/ui/cards/CalloutCard'
import { useCardIsEditing } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { useCardChrome } from '@kobato/inkling-internal/hooks/useCardChrome'
import { $isCalloutNode } from '@kobato/inkling-internal/nodes/base'
import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

function isCalloutColorName(color: string | undefined): color is CalloutColorName {
  return color !== undefined && Object.hasOwn(CALLOUT_COLORS, color)
}

function getNativeEmoji(emoji: unknown): string | undefined {
  if (typeof emoji === 'object' && emoji !== null && 'native' in emoji && typeof emoji.native === 'string') {
    return emoji.native
  }
  return undefined
}

export interface CalloutNodeComponentProps {
  nodeKey: NodeKey
  calloutEmoji?: string
  backgroundColor?: string
  calloutTextEditor: LexicalEditor
  calloutTextEditorInitialState?: EditorState | undefined
}

export function CalloutNodeComponent({
  nodeKey,
  calloutEmoji,
  backgroundColor,
  calloutTextEditor,
  calloutTextEditorInitialState,
}: CalloutNodeComponentProps) {
  const { write, setField } = useCardChrome(nodeKey, $isCalloutNode)
  const isEditing = useCardIsEditing(nodeKey)
  const [showEmojiPicker, setShowEmojiPicker] = React.useState<boolean>(false)

  const handleEmojiChange = setField('calloutEmoji')

  const handleEmojiSelect = React.useCallback(
    (newEmoji: unknown): void => {
      const nativeEmoji = getNativeEmoji(newEmoji)
      if (nativeEmoji === undefined) {
        return
      }
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
    write((node) => {
      node.backgroundColor = color
    })
  }

  return (
    <>
      <CalloutCard
        calloutEmoji={calloutEmoji}
        changeEmoji={handleEmojiSelect}
        color={isCalloutColorName(backgroundColor) ? backgroundColor : 'blue'}
        handleColorChange={handleBackgroundColorChange}
        isEditing={isEditing}
        nodeKey={nodeKey}
        setShowEmojiPicker={setShowEmojiPicker}
        showEmojiPicker={showEmojiPicker}
        textEditor={calloutTextEditor}
        textEditorInitialState={calloutTextEditorInitialState}
        toggleEmoji={handleToggleEmoji}
        toggleEmojiPicker={handleToggleEmojiPicker}
      />
      <CardActionToolbar editDataTestId="edit-callout-card" nodeKey={nodeKey} />
    </>
  )
}

export function renderCalloutCard(node: CalloutNode) {
  if (!node.__calloutTextEditor) {
    return null
  }

  return (
    <CalloutNodeComponent
      backgroundColor={node.backgroundColor}
      calloutEmoji={node.calloutEmoji}
      calloutTextEditor={node.__calloutTextEditor}
      calloutTextEditorInitialState={node.__calloutTextEditorInitialState}
      nodeKey={node.getKey()}
    />
  )
}
