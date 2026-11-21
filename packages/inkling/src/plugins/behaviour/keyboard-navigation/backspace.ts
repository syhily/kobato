import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor, LexicalNode } from 'lexical'

import { $isAsideNode } from '@kobato/inkling-internal/nodes/AsideNode'
import {
  $removeEmptyBlockAndSelectCard,
  $removeLogicallyAdjacentCard,
  dispatchSelectedCardDeletion,
  editorOwnsFocus,
} from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
import { $unwrapSpecialMarkupFormat } from '@kobato/inkling-internal/plugins/behaviour/markdown-unwrap'
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

          if (atStartOfElement && $isLinkNode(anchorNode.getPreviousSibling())) {
            const linkNode = anchorNode.getPreviousSibling()
            if ($isLinkNode(linkNode)) {
              const lastDescendent = linkNode.getLastDescendant()
              if ($isTextNode(lastDescendent)) {
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

          if ($removeLogicallyAdjacentCard('previous')) {
            event.preventDefault()
            return true
          }

          const anchorNodeLength = anchorNode.getTextContentSize()
          const atEndOfElement =
            selection.anchor.offset === anchorNodeLength && selection.focus.offset === anchorNodeLength

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
