// Paragraphs-only restriction policy, headless; RestrictContentPlugin is only the
// React adapter (it keeps the HIGH-priority paste wiring).
//
// The RootNode invariant strips decorator nodes (they cannot convert to paragraphs),
// truncates the document to `paragraphs`, unwraps lists to their first item and
// converts other non-paragraph elements to paragraphs, then repairs the selection to
// the document end. It runs only against a collapsed range selection: rewriting the
// tree under an open selection would yank its anchor.

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

import { isEditorUpdating } from '@/inkling/utils/lexical-internals'

/**
 * Any non-clean root (a decorator, a list, another non-paragraph element, or more
 * than `paragraphs` children) is rewritten to at most `paragraphs` paragraphs with
 * the selection repaired to the end. A clean root is left untouched, as is any state
 * without a collapsed range selection.
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

  let cleanedNodes = incomingNodes.filter((node) => {
    return !$isDecoratorNode(node)
  })

  cleanedNodes = cleanedNodes.slice(0, paragraphs)

  // Lists unwrap to their first item; other non-paragraph elements keep their children.
  cleanedNodes = cleanedNodes.map((node) => {
    if ($isListNode(node)) {
      const firstListItem = node.getFirstChild()
      if (!$isListItemNode(firstListItem)) {
        return $createParagraphNode()
      }
      return $createParagraphNode().append(...firstListItem.getChildren())
    } else if (!$isParagraphNode(node)) {
      // After the decorator filter the remaining root children are element nodes
      // (Lexical's root invariant) — narrow honestly instead of casting.
      if (!$isElementNode(node)) {
        return $createParagraphNode()
      }
      return $createParagraphNode().append(...node.getChildren())
    }
    return node
  })

  incomingNodes.forEach((node) => node.remove())
  cleanedNodes.forEach((node) => rootNode.append(node))
  rootNode.selectEnd()
}

/**
 * The RootNode transform plus the per-editor update guard. Even when registered on a
 * nested editor, a RootNode transform fires for root changes in OTHER editors, so the
 * guard restricts the invariant to this editor's updates.
 */
export function registerParagraphRestriction(editor: LexicalEditor, paragraphs: number): () => void {
  return editor.registerNodeTransform(RootNode, (rootNode) => {
    if (!isEditorUpdating(editor)) {
      return
    }

    $enforceParagraphRestriction(rootNode, paragraphs)
  })
}
