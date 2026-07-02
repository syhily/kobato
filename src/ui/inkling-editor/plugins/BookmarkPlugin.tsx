import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { mergeRegister } from '@lexical/utils'
import { $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH } from 'lexical'
import React from 'react'

import { $createBookmarkNode, BookmarkNode, INSERT_BOOKMARK_COMMAND } from '@/ui/inkling-editor/nodes/BookmarkNode'
import { INSERT_CARD_COMMAND } from '@/ui/inkling-editor/plugins/InklingBehaviourPlugin'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export const BookmarkPlugin = () => {
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!editor.hasNodes([BookmarkNode])) {
      return
    }
    return mergeRegister(
      editor.registerCommand(
        INSERT_BOOKMARK_COMMAND,
        (dataset) => {
          const selection = $getSelection()

          if (!$isRangeSelection(selection)) {
            return false
          }

          if (!isRecord(dataset)) {
            return false
          }

          const focusNode = selection.focus.getNode()
          if (focusNode !== null) {
            const cardNode = $createBookmarkNode(dataset)
            editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode })
          }

          return true
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor])

  return null
}

export default BookmarkPlugin
