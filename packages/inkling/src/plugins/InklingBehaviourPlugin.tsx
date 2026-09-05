import type { LexicalEditor } from 'lexical'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import React from 'react'

import { useCardSelectionStore } from '@/context/CardSelectionStoreContext'
import { registerDefaultTransforms } from '@/transforms'

import { getModifierState } from './behaviour/clipboard-protocol'
import { registerCardCommands } from './behaviour/registerCardCommands'
import { registerCardSelection } from './behaviour/registerCardSelection'
import { registerClickAndCut } from './behaviour/registerClickAndCut'
import { registerKeyboardNavigation } from './behaviour/registerKeyboardNavigation'
import { registerLinkMatching } from './behaviour/registerLinkMatching'
import { registerMouseEvents } from './behaviour/registerMouseEvents'
import { registerPasteHandler } from './behaviour/registerPasteHandler'

interface InklingBehaviourPluginProps {
  containerElem?: React.RefObject<HTMLElement | null>
  cursorDidExitAtTop?: () => void
  isNested?: boolean
  /** True on surfaces that expose alignment controls: imported/typed `format` is kept instead of stripped. */
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

  const isShiftPressed = getModifierState(editor)

  React.useEffect(() => {
    return registerMouseEvents(editor, { containerElem, isNested })
  }, [editor, containerElem, isNested])

  // Register the behaviour listeners once per mount. Handlers read card
  // selection synchronously from the store, so listeners no longer need to be
  // torn down and re-registered per render to keep their closures fresh.
  React.useEffect(() => {
    return mergeRegister(
      registerCardSelection(editor, {
        store: cardSelectionStore,
        isNested,
      }),
      registerCardCommands(editor, {
        store: cardSelectionStore,
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
  }, [editor, cardSelectionStore, isNested, cursorDidExitAtTop, isShiftPressed])

  // remove alignment formats (unless the surface keeps alignment),
  // denest invalid node nesting,
  // merge list nodes of same type
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
  // Fallback container for the outside-click deselect: this editor's own root
  // element, read lazily because it is null at first render and set on mount.
  // Scoping per editor keeps multi-editor pages from cross-scoping the
  // deselect, and no document access happens during render.
  // the getter reads the editor lazily (outside render), so the memo itself
  // has no reactive inputs — the composer editor is stable for the
  // component's lifetime, hence the empty dep list
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
