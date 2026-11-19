import type { KeyboardNavigationDeps } from '@kobato/inkling-internal/plugins/behaviour/keyboard-navigation/types'
import type { LexicalEditor, LexicalNode } from 'lexical'

import { $fireFenceKeyboardShortcut } from '@kobato/inkling-internal/markdown/card-shortcuts'
import { editorOwnsFocus } from '@kobato/inkling-internal/plugins/behaviour/card-adjacency'
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

export function registerTabCommand(editor: LexicalEditor, deps: KeyboardNavigationDeps): () => void {
  const { isNested, cursorDidExitAtTop } = deps

  return editor.registerCommand(
    KEY_TAB_COMMAND,
    (event) => {
      if (!editorOwnsFocus(editor)) {
        return true
      }

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

      if (!isNested) {
        if ($fireFenceKeyboardShortcut(event)) {
          return true
        }

        const selection = $getSelection()
        const currentNode = selection?.getNodes()[0]

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

        event.preventDefault()
        return true
      }

      return false
    },
    COMMAND_PRIORITY_LOW,
  )
}
