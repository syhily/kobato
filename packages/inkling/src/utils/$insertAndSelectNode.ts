import { $createNodeSelection, $isParagraphNode, $setSelection, type LexicalNode } from 'lexical'

import { $ensureParagraphAfterCard } from '@/utils/$ensureParagraphAfterCard'

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

  // an inserted card at the end of the document still needs a trailing paragraph
  $ensureParagraphAfterCard(newNode)
}
