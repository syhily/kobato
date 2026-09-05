import type { LexicalEditor, LexicalNode } from 'lexical'

import { $isListItemNode } from '@lexical/list'
import {
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  KEY_TAB_COMMAND,
} from 'lexical'

import { $fireFenceKeyboardShortcut } from '@/markdown/card-shortcuts'

import type { KeyboardNavigationDeps } from './types'

import { editorOwnsFocus } from '../card-adjacency'

export function registerTabCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { isNested, cursorDidExitAtTop } = deps

  return editor.registerCommand(
    KEY_TAB_COMMAND,
    (event) => {
      // avoid processing card behaviours when an inner element has focus
      if (!editorOwnsFocus(editor)) {
        return true
      }

      // exit the editor if we're shift tabbing on an element that isn't tabbed
      if (event.shiftKey && cursorDidExitAtTop) {
        const selection = $getSelection()

        if ($isNodeSelection(selection)) {
          event.preventDefault()
          selection.clear()
          cursorDidExitAtTop()
          return true
        }

        let nodes: Array<LexicalNode | null>
        if ($isRangeSelection(selection) && selection.isCollapsed()) {
          const anchorNode = selection.anchor.getNode()
          nodes = $isTextNode(anchorNode) ? [anchorNode.getParent()] : [anchorNode]
        } else if ($isRangeSelection(selection)) {
          nodes = selection.getNodes()
        } else {
          return false
        }

        const hasIndentedNode = nodes.some((node) => {
          return node && $isElementNode(node) && node.getIndent() > 0
        })

        if (!hasIndentedNode) {
          event.preventDefault()
          cursorDidExitAtTop()
          return true
        }
      }

      // code card shortcut — trigger only; the regex, language extraction, and
      // replace-and-select live in the card-shortcut seam (@/markdown/card-shortcuts)
      if (!isNested) {
        if ($fireFenceKeyboardShortcut(event)) {
          return true
        }

        const selection = $getSelection()
        const currentNode = selection?.getNodes()[0]

        // handle indent behavior
        if ($isListItemNode(currentNode) || ($isTextNode(currentNode) && $isListItemNode(currentNode.getParent()))) {
          event.preventDefault()
          let node = $isTextNode(currentNode) ? currentNode.getParent() : currentNode
          if (!node) {
            return false
          }
          const indent = node.getIndent()
          if (event.shiftKey) {
            if (indent > 0) {
              node.setIndent(indent - 1)
            }
          } else {
            node.setIndent(indent + 1)
          }
          return true
        }

        // generally prevent tabs from leaving the editor/interacting with the browser
        event.preventDefault()
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
