import type { LexicalEditor } from 'lexical'

import { INSERT_CARD_COMMAND, PASTE_LINK_COMMAND } from '@kobato/inkling-internal/plugins/behaviour/commands'
import { getRegisteredNodeMap } from '@kobato/inkling-internal/utils/lexical-internals'
import { $createLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $createTextNode, $getSelection, $insertNodes, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'

interface LinkMatchingDeps {
  isShiftPressed: { current: boolean }
}

export function registerLinkMatching(editor: LexicalEditor, deps: LinkMatchingDeps) {
  const { isShiftPressed } = deps

  return editor.registerCommand(
    PASTE_LINK_COMMAND,
    ({ linkMatch }) => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection)) {
        return false
      }
      const selectionContent = selection.getTextContent()
      const node = selection.anchor.getNode()
      const nodeContent = node.getTextContent()

      if (selectionContent.length > 0) {
        const url = linkMatch[1]
        if (url) {
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, { url, rel: null })
        }
        return true
      }

      const BookmarkNodeClass = getRegisteredNodeMap(editor).get('bookmark')?.klass

      if (
        selectionContent.length === 0 &&
        nodeContent.length === 0 &&
        isShiftPressed.current !== true &&
        BookmarkNodeClass
      ) {
        const url = linkMatch[1]
        if (!url) {
          return false
        }
        const bookmarkNode = new BookmarkNodeClass({ url })
        editor.dispatchCommand(INSERT_CARD_COMMAND, { cardNode: bookmarkNode })
        return true
      }

      if (nodeContent.length > 0 || isShiftPressed.current === true || !BookmarkNodeClass) {
        const link = linkMatch[1]
        if (!link) {
          return false
        }
        const linkNode = $createLinkNode(link)
        const linkTextNode = $createTextNode(link)
        linkNode.append(linkTextNode)

        const spaceTextNode = $createTextNode(' ')
        $insertNodes([linkNode, spaceTextNode])
        spaceTextNode.remove()

        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
