import type { CardSelectionStore } from '@kobato/inkling-internal/plugins/behaviour/card-selection-store'
import type { LexicalEditor, NodeKey } from 'lexical'

import { $isInklingCard } from '@kobato/inkling-internal/nodes/base'
import { EDIT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical'

export interface CardInteractionPorts {
  store: CardSelectionStore
  getContainer: () => HTMLElement | null
}

export function registerCardInteraction(
  editor: LexicalEditor,
  nodeKey: NodeKey,
  { store, getContainer }: CardInteractionPorts,
): () => void {
  let skipClick = false

  const isSelected = () => store.getState().selectedCardKey === nodeKey
  const isEditing = () => isSelected() && store.getState().isEditingCard

  // the selection as it was BEFORE this mousedown's side effects: Lexical's
  // root-level capture-phase mousedown handling selects a clicked decorator
  // and the card selection store syncs at that commit — all before any
  // container listener (bubble or capture, the root sits above it) runs.
  // The guard below needs the pre-click truth ("was this card already
  // selected?"), captured at document capture, which descends first.
  let selectedKeyBeforeMousedown: NodeKey | null = null
  const snapshotSelection = () => {
    selectedKeyBeforeMousedown = store.getState().selectedCardKey
  }
  document.addEventListener('mousedown', snapshotSelection, { capture: true })

  function handleMousedown(event: MouseEvent) {
    if (selectedKeyBeforeMousedown !== nodeKey && !isEditing()) {
      editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })

      skipClick = true

      const target = event.target
      if (target instanceof HTMLElement) {
        const targetTagName = target.tagName
        const allowedTagNames = ['INPUT', 'TEXTAREA']
        const allowClickthrough = !!target.closest('[data-inkling-allow-clickthrough]')

        if (!allowedTagNames.includes(targetTagName) && !allowClickthrough) {
          event.preventDefault()
        }
      }
    }
  }

  getContainer()?.addEventListener('mousedown', handleMousedown)

  const releaseSkipClick = () => {
    if (skipClick) {
      setTimeout(() => {
        skipClick = false
      }, 0)
    }
  }
  document.addEventListener('mouseup', releaseSkipClick)

  const unregisterCommand = editor.registerCommand(
    CLICK_COMMAND,
    (event: MouseEvent) => {
      const target = event.target
      if (!skipClick && target instanceof Element && getContainer()?.contains(target)) {
        const node = $getNodeByKey(nodeKey)
        const cardNode = node && $isInklingCard(node) ? node : null
        const clickedDifferentEditor = cardNode === null

        const clickedClickthrough = target.closest('[data-inkling-allow-clickthrough]')
        const clickedSettingsPanel = target.closest('[data-inkling-settings-panel]')

        if (isSelected() && cardNode?.hasEditMode() && !isEditing() && !clickedClickthrough && !clickedSettingsPanel) {
          editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
        } else if (!isSelected()) {
          editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
        }

        if (clickedDifferentEditor) {
          return false
        }

        return true
      }

      if (skipClick === true) {
        skipClick = false
        return true
      }

      skipClick = false
      return false
    },
    COMMAND_PRIORITY_LOW,
  )

  return () => {
    unregisterCommand()
    document.removeEventListener('mousedown', snapshotSelection, { capture: true })
    document.removeEventListener('mouseup', releaseSkipClick)
    getContainer()?.removeEventListener('mousedown', handleMousedown)
  }
}
