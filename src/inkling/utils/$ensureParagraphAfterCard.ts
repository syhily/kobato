import { $createParagraphNode, type LexicalNode, type ParagraphNode } from 'lexical'

// Single home for the "a card at the end of the document needs a trailing
// paragraph" policy — without one the caret has nowhere to land after the
// card. The insert, delete, and arrow-key paths used to re-spell the rule and
// its two selection choices at every call site; callers now decide only
// whether the new paragraph takes the selection. Returns the inserted
// paragraph, or undefined when the card is not the last top-level node (or is
// not attached to an editor yet).
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
