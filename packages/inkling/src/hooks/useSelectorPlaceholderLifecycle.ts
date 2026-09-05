import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNodeByKey, type NodeKey } from 'lexical'
import React from 'react'

import { DELETE_CARD_COMMAND } from '@/plugins/behaviour/commands'

// The selector-placeholder lifecycle (CONTEXT.md: "media library"): the
// overlay is open while its placeholder node exists — Escape and
// click-outside delete the placeholder, and a pick that resolves after
// cancellation is a no-op (the host upload UX can land after the picker is
// gone; the insert surgery replaces the placeholder, so there is nothing to
// do once it is gone). One owner for the policy GifPlugin and LibraryPlugin
// used to copy — and drift on (only the library guarded the async pick);
// the plugins keep only their config gate, browser, and selector wiring.
export function useSelectorPlaceholderLifecycle(nodeKey: NodeKey) {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, nodeKey])

  /** Click-outside close: deletes the placeholder, so the document keeps no trace of the overlay. */
  const closeSelector = React.useCallback(() => {
    editor.dispatchCommand(DELETE_CARD_COMMAND, { cardKey: nodeKey })
  }, [editor, nodeKey])

  /** True while the placeholder node exists — an async pick that lands after cancellation must no-op. */
  const placeholderExists = React.useCallback(() => {
    return editor.getEditorState().read(() => $getNodeByKey(nodeKey) !== null)
  }, [editor, nodeKey])

  return { closeSelector, placeholderExists }
}
