import type { LexicalEditor, LexicalNode } from 'lexical'

import { $isLinkNode } from '@lexical/link'
import { $isListItemNode } from '@lexical/list'
import { $isQuoteNode } from '@lexical/rich-text'
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_BACKSPACE_COMMAND,
} from 'lexical'

import type { KeyboardNavigationDeps } from '@/inkling/plugins/behaviour/keyboard-navigation/types'

import { $isAsideNode } from '@/inkling/nodes/AsideNode'
import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '@/inkling/plugins/behaviour/card-adjacency'
import { $unwrapSpecialMarkupFormat } from '@/inkling/plugins/behaviour/markdown-unwrap'

// Convert a top-level list item to a paragraph when backspace lands at the item's
// start boundary. Two anchor shapes: an EMPTY item (the selection anchor IS the
// item) rides Lexical's INSERT_PARAGRAPH_COMMAND so list structure stays correct;
// a POPULATED item (the anchor is its child) is replaced by a paragraph carrying
// its children. Runs after the firefox-workaround and empty-block checks, which
// cannot match a ListItemNode anchor.
function $convertListItemToParagraph(anchorNode: LexicalNode, editor: LexicalEditor): boolean {
  if ($isListItemNode(anchorNode) && anchorNode.getIndent() === 0 && anchorNode.isEmpty()) {
    editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined)
    return true
  }

  const listItemNode = anchorNode.getParent()
  if ($isListItemNode(listItemNode) && listItemNode.getIndent() === 0) {
    const paragraphNode = $createParagraphNode()
    paragraphNode.append(...listItemNode.getChildren())
    listItemNode.replace(paragraphNode)
    return true
  }
  return false
}

export function registerBackspaceCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { store, isNested } = deps

  return editor.registerCommand(
    KEY_BACKSPACE_COMMAND,
    (event) => {
      // Focus is inside an inner element (e.g. a nested editor): swallow the key.
      if (!editorOwnsFocus(editor)) {
        return true
      }

      if (dispatchSelectedCardDeletion(editor, store, isNested, 'backward', event)) {
        return true
      }

      const selection = $getSelection()

      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          const atStartOfElement = selection.anchor.offset === 0 && selection.focus.offset === 0

          // Firefox-only upstream bug: https://github.com/facebook/lexical/issues/5226
          if (atStartOfElement && $isLinkNode(anchorNode.getPreviousSibling())) {
            const linkNode = anchorNode.getPreviousSibling()
            if ($isLinkNode(linkNode)) {
              const lastDescendent = linkNode.getLastDescendant()
              if ($isTextNode(lastDescendent)) {
                // spliceText keeps slice(0, offset) + slice(offset + delCount), so deleting the
                // last character means offsetting one before the end; an empty text node passes
                // -1, which lexical clamps to a no-op
                lastDescendent.spliceText(lastDescendent.getTextContentSize() - 1, 1, '', true)
                return true
              }
            }
          }

          if ($removeEmptyBlockAndSelectCard('previous', 'paragraph-is-empty')) {
            return true
          }

          if (atStartOfElement && $convertListItemToParagraph(anchorNode, editor)) {
            event.preventDefault()
            return true
          }

          const anchorNodeParent = anchorNode.getParent()

          if (
            atStartOfElement &&
            anchorNodeParent &&
            ($isQuoteNode(anchorNodeParent) || $isAsideNode(anchorNodeParent))
          ) {
            const paragraph = $createParagraphNode()
            anchorNodeParent.getChildren().forEach((child) => {
              paragraph.append(child)
            })
            anchorNodeParent.replace(paragraph)
            paragraph.selectStart()
            event.preventDefault()
            return true
          }

          // Selection-mode 'previous' is gated on exactly atStartOfElement inside the surgery.
          if ($removeLogicallyAdjacentCard('previous')) {
            event.preventDefault()
            return true
          }

          const anchorNodeLength = anchorNode.getTextContentSize()
          const atEndOfElement =
            selection.anchor.offset === anchorNodeLength && selection.focus.offset === anchorNodeLength

          // Undo markdown special formats when deleting at the end of a formatted text node.
          if (atEndOfElement && $isTextNode(anchorNode) && $unwrapSpecialMarkupFormat(anchorNode, selection)) {
            event.preventDefault()
            return true
          }
        }
      }
      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
