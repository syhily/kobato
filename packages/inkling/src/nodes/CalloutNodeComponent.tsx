import { type EditorState, type LexicalEditor, type NodeKey } from 'lexical'
import React from 'react'

import type { CalloutNode } from '@/nodes/CalloutNode'

import { CardActionToolbar } from '@/components/ui/CardActionToolbar'
import { CALLOUT_COLORS, CalloutCard, type CalloutColorName } from '@/components/ui/cards/CalloutCard'
import { useCardIsEditing } from '@/context/CardSelectionStoreContext'
import { useCardChrome } from '@/hooks/useCardChrome'
import { $isCalloutNode } from '@/nodes/base'

// backgroundColor is a free string on the node — HTML import captures any
// `inkling-callout-card-*` class word — so narrow it to the known palette at
// the card seam, falling back to the node's own default
function isCalloutColorName(color: string | undefined): color is CalloutColorName {
  return color !== undefined && Object.hasOwn(CALLOUT_COLORS, color)
}

// emoji-mart yields `{ native }` for standard emojis; custom emojis (this
// picker isn't configured with any) carry `src` instead
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
  // non-null: the decorate mapper guards the headless round-trip null state
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

/**
 * Callout's decorate render — the React-bearing half of its decorate-target,
 * paired with the declaration by `@/nodes/cards/card-decorate`.
 */
export function renderCalloutCard(node: CalloutNode) {
  // Null only inside the headless markdown round-trip editor (the card
  // transformers null the nested editors after plain-text import), which
  // never reconciles decorators — guard so the field type stays honest.
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
