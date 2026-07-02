import { $isListItemNode } from '@lexical/list'
import { $isRangeSelection, $isTextNode, type BaseSelection, type LexicalNode } from 'lexical'

export function $isAtStartOfDocument(selection: BaseSelection): boolean {
  let [selectedNode] = selection.getNodes() as LexicalNode[]

  if ($isTextNode(selectedNode)) {
    selectedNode = selectedNode.getParent() as LexicalNode
  }

  if (!selectedNode) {
    return false
  }

  const selectedTopLevelElement = selectedNode.getTopLevelElement()

  // handle nested lists, where parent for a text node is not enough
  if ($isListItemNode(selectedNode) && selectedTopLevelElement !== selectedNode.getParent()) {
    return false
  }

  const selectedIndex = selectedNode.getIndexWithinParent()
  const selectedTopLevelIndex = selectedTopLevelElement ? selectedTopLevelElement.getIndexWithinParent() : undefined

  if (!$isRangeSelection(selection)) {
    return selectedIndex === 0 && selectedTopLevelIndex === 0
  }

  return (
    selectedIndex === 0 && selectedTopLevelIndex === 0 && selection.anchor.offset === 0 && selection.focus.offset === 0
  )
}
