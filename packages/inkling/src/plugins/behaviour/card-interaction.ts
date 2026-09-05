import type { LexicalEditor, NodeKey } from 'lexical'

import { $getNodeByKey, CLICK_COMMAND, COMMAND_PRIORITY_LOW } from 'lexical'

import type { CardSelectionStore } from '@/plugins/behaviour/cardSelectionStore'

import { $isInklingCard } from '@/nodes/base'
import { EDIT_CARD_COMMAND, SELECT_CARD_COMMAND } from '@/plugins/behaviour/commands'

// Card interaction — the headless select→edit choreography behind
// InklingCardWrapper, the last card-behaviour family that lived
// component-side (its siblings — card-menu session, toolbar session, emoji
// completion — already have their modules). One registration per card
// nodeKey: the editor-level CLICK_COMMAND handler (editor-level so the
// card can prevent the editor's default click behaviour without preventing
// React components inside the card from handling their own) and the
// container's mousedown select-and-swallow. Selection/edit truth is read
// from the card selection store AT EVENT TIME, so the registration is
// stable for the card's lifetime — no re-registration per render.

// InklingCardWrapper is only rendered for generated card nodes (decorateCard
// throws otherwise), but the type system can't see that — $isInklingCard's
// runtime marker check is the discriminator (no asserting).

export interface CardInteractionPorts {
  /** The composer card selection store — read at event time. */
  store: CardSelectionStore
  /** The card's container element (null before mount). */
  getContainer: () => HTMLElement | null
}

/**
 * Registers one card's click choreography. Returns the teardown.
 *
 * Click policy: a click inside the container (that wasn't swallowed by the
 * mousedown path) enters edit mode when the card is selected, has an edit
 * mode, and the click missed the click-through and settings-panel zones;
 * otherwise it selects the card. A click landing while the card's node is
 * gone (a different editor's card re-rendered over the event) is not
 * consumed. Mousedown policy: an unselected, non-editing card selects on
 * mousedown and swallows the follow-up click (so it doesn't instantly
 * enter edit mode), preventing the editor's caret move except over
 * inputs/textareas and click-through zones.
 */
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

      // skip CLICK_COMMAND behaviour otherwise we'll immediately enter edit mode
      skipClick = true

      // in most situations we want to prevent default behaviour which
      // can cause an underlying cursor position change but inputs and
      // textareas are different and we want the focus to move to them
      // immediately when clicked
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

  // skipClick may only swallow the click that immediately follows its
  // mousedown; when that click never comes (drag aborted, released
  // elsewhere) the flag would stick and swallow a later, unrelated click.
  // Release it on mouseup — deferred, because the gesture's own click is
  // dispatched right after mouseup and must still be swallowed.
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
        // elements marked as click-through (captions, toolbars) handle their own
        // clicks and must not trigger the card's edit mode
        const clickedClickthrough = target.closest('[data-inkling-allow-clickthrough]')
        const clickedSettingsPanel = target.closest('[data-inkling-settings-panel]')

        if (isSelected() && cardNode?.hasEditMode() && !isEditing() && !clickedClickthrough && !clickedSettingsPanel) {
          editor.dispatchCommand(EDIT_CARD_COMMAND, { cardKey: nodeKey })
        } else if (!isSelected()) {
          editor.dispatchCommand(SELECT_CARD_COMMAND, { cardKey: nodeKey })
        }

        if (clickedDifferentEditor) {
          // click is in a different editor
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
