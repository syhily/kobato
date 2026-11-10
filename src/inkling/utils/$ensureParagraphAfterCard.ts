import { $createParagraphNode, type LexicalNode, type ParagraphNode } from 'lexical'

// A card at the end of the document needs a trailing paragraph, otherwise the caret has
// nowhere to land after it. Returns the inserted paragraph, or undefined when the card is
// not the last top-level node (or is not attached to an editor yet).
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
