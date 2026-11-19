import type { LexicalEditor } from 'lexical'

import { useCardPickerStore } from '@kobato/inkling-internal/context/CardPickerStoreContext'
import { useCardSelectionStore } from '@kobato/inkling-internal/context/CardSelectionStoreContext'
import { getModifierState } from '@kobato/inkling-internal/plugins/behaviour/clipboard-protocol'
import { registerCardCommands } from '@kobato/inkling-internal/plugins/behaviour/register-card-commands'
import { registerCardSelection } from '@kobato/inkling-internal/plugins/behaviour/register-card-selection'
import { registerClickAndCut } from '@kobato/inkling-internal/plugins/behaviour/register-click-and-cut'
import { registerKeyboardNavigation } from '@kobato/inkling-internal/plugins/behaviour/register-keyboard-navigation'
import { registerLinkMatching } from '@kobato/inkling-internal/plugins/behaviour/register-link-matching'
import { registerMouseEvents } from '@kobato/inkling-internal/plugins/behaviour/register-mouse-events'
import { registerPasteHandler } from '@kobato/inkling-internal/plugins/behaviour/register-paste-handler'
import { registerDefaultTransforms } from '@kobato/inkling-internal/transforms'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import React from 'react'

interface InklingBehaviourPluginProps {
  containerElem?: React.RefObject<HTMLElement | null>
  cursorDidExitAtTop?: () => void
  isNested?: boolean
  alignment?: boolean
}

function useInklingBehaviour({
  editor,
  containerElem,
  cursorDidExitAtTop,
  isNested,
  alignment,
}: {
  editor: LexicalEditor
  containerElem: React.RefObject<HTMLElement | null>
  cursorDidExitAtTop?: () => void
  isNested?: boolean
  alignment?: boolean
}) {
  const cardSelectionStore = useCardSelectionStore()
  const cardPickerStore = useCardPickerStore()

  const isShiftPressed = getModifierState(editor)

  React.useEffect(() => {
    return registerMouseEvents(editor, { containerElem, isNested })
  }, [editor, containerElem, isNested])

  // Register the behaviour listeners once per mount. Handlers read card
  // selection synchronously from the store, so listeners stay registered for
  // the mount's lifetime instead of re-registering per render to keep their
  // closures fresh.
  React.useEffect(() => {
    return mergeRegister(
      registerCardSelection(editor, {
        store: cardSelectionStore,
        isNested,
      }),
      registerCardCommands(editor, {
        store: cardSelectionStore,
        pickerStore: cardPickerStore,
      }),
      registerKeyboardNavigation(editor, {
        store: cardSelectionStore,
        isNested,
        cursorDidExitAtTop,
      }),
      registerPasteHandler(editor, { isNested }),
      registerLinkMatching(editor, { isShiftPressed }),
      registerClickAndCut(editor),
    )
  }, [editor, cardSelectionStore, cardPickerStore, isNested, cursorDidExitAtTop, isShiftPressed])

  React.useEffect(() => {
    return registerDefaultTransforms(editor, { alignment: alignment ? 'keep' : 'strip' })
  }, [editor, alignment])

  return null
}

export default function InklingBehaviourPlugin({
  containerElem,
  cursorDidExitAtTop,
  isNested,
  alignment,
}: InklingBehaviourPluginProps) {
  const [editor] = useLexicalComposerContext()

  const fallbackRef = React.useMemo<React.RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return editor.getRootElement()
      },
    }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return useInklingBehaviour({
    editor,
    containerElem: containerElem ?? fallbackRef,
    cursorDidExitAtTop,
    isNested,
    alignment,
  })
}
