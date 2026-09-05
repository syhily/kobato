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

import { $isAsideNode } from '@/nodes/AsideNode'

import type { KeyboardNavigationDeps } from './types'

import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '../card-adjacency'
import { $unwrapSpecialMarkupFormat } from '../markdown-unwrap'

// Convert a top-level list item to a paragraph when backspace lands at the
// item's start boundary — two anchor shapes, one policy:
// - the cursor sits directly in an EMPTY item (no text node exists, so the
//   selection anchor IS the item): ride Lexical's INSERT_PARAGRAPH_COMMAND so
//   the surrounding list structure stays correct;
// - the cursor is at the start of a POPULATED item (the anchor is the item's
//   child): replace the item with a paragraph carrying its children.
// Placed AFTER the firefox-workaround and empty-block checks in the handler:
// neither applies to a ListItemNode anchor, so the merge preserves the exact
// evaluation order the two former branches had.
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
      // avoid processing card behaviours when an inner element has focus
      if (!editorOwnsFocus(editor)) {
        return true
      }

      // delete selected card if we have one
      if (dispatchSelectedCardDeletion(editor, store, isNested, 'backward', event)) {
        return true
      }

      const selection = $getSelection()

      if ($isRangeSelection(selection)) {
        if (selection.isCollapsed()) {
          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          const atStartOfElement = selection.anchor.offset === 0 && selection.focus.offset === 0

          // see https://github.com/facebook/lexical/issues/5226
          // upstream bug with firefox only
          if (atStartOfElement && $isLinkNode(anchorNode.getPreviousSibling())) {
            const linkNode = anchorNode.getPreviousSibling()
            if ($isLinkNode(linkNode)) {
              const lastDescendent = linkNode.getLastDescendant()
              if ($isTextNode(lastDescendent)) {
                // spliceText keeps slice(0, offset) + slice(offset + delCount), so deleting
                // the last character means offsetting one before the end; an empty text node
                // passes -1, which lexical clamps to a no-op
                lastDescendent.spliceText(lastDescendent.getTextContentSize() - 1, 1, '', true)
                return true
              }
            }
          }

          // delete empty paragraphs and select card if preceded by card
          if ($removeEmptyBlockAndSelectCard('previous', 'paragraph-is-empty')) {
            return true
          }

          // convert top level list items to paragraphs when cursor is at beginning
          // (empty and populated items — see $convertListItemToParagraph)
          if (atStartOfElement && $convertListItemToParagraph(anchorNode, editor)) {
            event.preventDefault()
            return true
          }

          const anchorNodeParent = anchorNode.getParent()

          // convert to paragraph if backspace is at start of the quote/aside block
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

          // delete any previous card keeping caret in place
          // (selection-mode 'previous' is gated on exactly atStartOfElement inside the surgery)
          if ($removeLogicallyAdjacentCard('previous')) {
            event.preventDefault()
            return true
          }

          const anchorNodeLength = anchorNode.getTextContentSize()
          const atEndOfElement =
            selection.anchor.offset === anchorNodeLength && selection.focus.offset === anchorNodeLength

          // undo any markdown special formats when deleting at the end of a formatted text node
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
