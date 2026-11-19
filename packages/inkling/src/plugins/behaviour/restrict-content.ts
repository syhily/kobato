import { isEditorUpdating } from '@kobato/inkling-internal/utils/lexical-internals'
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

  cleanedNodes = cleanedNodes.map((node) => {
    if ($isListNode(node)) {
      const firstListItem = node.getFirstChild()
      if (!$isListItemNode(firstListItem)) {
        return $createParagraphNode()
      }
      return $createParagraphNode().append(...firstListItem.getChildren())
    } else if (!$isParagraphNode(node)) {
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

export function registerParagraphRestriction(editor: LexicalEditor, paragraphs: number): () => void {
  return editor.registerNodeTransform(RootNode, (rootNode) => {
    if (!isEditorUpdating(editor)) {
      return
    }

    $enforceParagraphRestriction(rootNode, paragraphs)
  })
}
