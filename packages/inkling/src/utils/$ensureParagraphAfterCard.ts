import { $createParagraphNode, type LexicalNode, type ParagraphNode } from 'lexical'

export function $ensureParagraphAfterCard(
  cardNode: LexicalNode,
  { select = false }: { select?: boolean } = {},
): ParagraphNode | undefined {
  const topLevelElement = cardNode.getTopLevelElement()
  if (!topLevelElement || topLevelElement.getNextSibling()) {
    return undefined
  }
  const paragraph = $createParagraphNode()
  topLevelElement.insertAfter(paragraph)
  if (select) {
    paragraph.select()
  }
  return paragraph
}
