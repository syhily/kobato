// The paragraphs-only restriction policy — headless; `RestrictContentPlugin`
// is only the React adapter (it keeps the HIGH-priority paste wiring; the
// RootNode transform registration and its per-editor update guard live here,
// mirroring registerTableCellGuard). One piece:
//
// - **Paragraph restriction** (`$enforceParagraphRestriction`) — the
//   RootNode-invariant body: strip decorator nodes (they can't convert to
//   paragraphs), truncate the document to `paragraphs`, unwrap lists to
//   their first item and convert other non-paragraph elements to
//   paragraphs, then repair the selection to the document end. Runs only
//   against a collapsed range selection — rewriting the tree under an open
//   selection would yank its anchor.

import { $isListItemNode, $isListNode } from '@lexical/list'
import {
  $createParagraphNode,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  RootNode,
  type LexicalEditor,
} from 'lexical'

import { isEditorUpdating } from '@/utils/lexical-internals'

/**
 * The cleaning policy: any non-clean root (a decorator, a list, any other
 * non-paragraph element, or more than `paragraphs` children) is rewritten
 * to at most `paragraphs` paragraphs, and the selection is repaired to the
 * end of the rewritten document. A clean root is left untouched, as is any
 * state without a collapsed range selection.
 */
export function $enforceParagraphRestriction(rootNode: RootNode, paragraphs: number): void {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return
  }

  const incomingNodes = rootNode.getChildren()

  const incomingIsClean = incomingNodes.length <= paragraphs && incomingNodes.every($isParagraphNode)

  if (incomingIsClean) {
    return
  }

  // strip out any decorator nodes as we can't convert them to paragraphs
  let cleanedNodes = incomingNodes.filter((node) => {
    return !$isDecoratorNode(node)
  })

  // truncate cleanedNodes to the specified number of paragraphs
  cleanedNodes = cleanedNodes.slice(0, paragraphs)

  // for any list nodes, convert first item of list to a paragraph
  // for other non-paragraph nodes, convert them to a paragraph
  cleanedNodes = cleanedNodes.map((node) => {
    if ($isListNode(node)) {
      const firstListItem = node.getFirstChild()
      if (!$isListItemNode(firstListItem)) {
        return $createParagraphNode()
      }
      return $createParagraphNode().append(...firstListItem.getChildren())
    } else if (!$isParagraphNode(node)) {
      // after the decorator filter the remaining root children are
      // element nodes (Lexical's root invariant) — narrow honestly
      // instead of casting on the strength of the invariant
      if (!$isElementNode(node)) {
        return $createParagraphNode()
      }
      return $createParagraphNode().append(...node.getChildren())
    } else {
      return node
    }
  })

  // remove all existing nodes from state
  incomingNodes.forEach((node) => node.remove())
  // add our new node to the now empty rootNode
  cleanedNodes.forEach((node) => rootNode.append(node))
  // move selection to end of new node
  rootNode.selectEnd()
}

/**
 * The genus-shaped registration (mirrors `registerTableCellGuard`): the
 * RootNode transform plus the per-editor update guard. Even registered on a
 * nested editor, a RootNode transform fires for root changes in OTHER
 * editors, so the guard restricts the invariant to this editor's updates.
 */
export function registerParagraphRestriction(editor: LexicalEditor, paragraphs: number): () => void {
  return editor.registerNodeTransform(RootNode, (rootNode) => {
    if (!isEditorUpdating(editor)) {
      return
    }

    $enforceParagraphRestriction(rootNode, paragraphs)
  })
}
