import { $ensureParagraphAfterCard } from '@kobato/inkling-internal/utils/$ensureParagraphAfterCard'
import { $createNodeSelection, $isParagraphNode, $setSelection, type LexicalNode } from 'lexical'

export const $insertAndSelectNode = ({
  selectedNode,
  newNode,
}: {
  selectedNode: LexicalNode
  newNode: LexicalNode
}): void => {
  const selectedIsParagraph = $isParagraphNode(selectedNode)
  const selectedIsEmpty = selectedNode.getTextContent() === ''

  selectedNode.insertAfter(newNode)

  if (selectedIsParagraph && selectedIsEmpty) {
    selectedNode.remove()
  }

  const nodeSelection = $createNodeSelection()
  nodeSelection.add(newNode.getKey())
  $setSelection(nodeSelection)

  $ensureParagraphAfterCard(newNode)
}
