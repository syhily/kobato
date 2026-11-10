import type { LexicalEditor } from 'lexical'

import { $createLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import { $createTextNode, $getSelection, $insertNodes, $isRangeSelection, COMMAND_PRIORITY_LOW } from 'lexical'

import { INSERT_CARD_COMMAND, PASTE_LINK_COMMAND } from '@/inkling/plugins/behaviour/commands'
import { getRegisteredNodeMap } from '@/inkling/utils/lexical-internals'

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

      // The bookmark class is resolved from the registered-node map, not
      // imported from the shim — this module is on the card-free core path.
      // When the editor doesn't register the bookmark card, a bare-URL paste
      // degrades to the plain-link branch below.
      const BookmarkNodeClass = getRegisteredNodeMap(editor).get('bookmark')?.klass

      // if a link is pasted in a blank text node, insert a bookmark card
      // (Shift-paste always takes the plain-link branch below)
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

      // if a link is pasted in a populated text node or pasted with Shift pressed, insert a link
      if (nodeContent.length > 0 || isShiftPressed.current === true || !BookmarkNodeClass) {
        const link = linkMatch[1]
        if (!link) {
          return false
        }
        const linkNode = $createLinkNode(link)
        const linkTextNode = $createTextNode(link)
        linkNode.append(linkTextNode)

        // Lexical lands the cursor inside the link on insertion (0.53):
        // inserting a trailing space and immediately removing it puts the
        // selection after the link node instead.
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
