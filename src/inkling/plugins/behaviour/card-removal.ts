/**
 * Card removal — the headless splice surgery for taking a card out of the
 * document and leaving a writable paragraph behind. Same plain
 * `$`-function family as drop-surgery and external-control; never a
 * React-inline `$getNodeByKey` + raw mutation.
 */

import { $createParagraphNode, $getNodeByKey, $isParagraphNode, type LexicalNode, type NodeKey } from 'lexical'

/**
 * Replaces the card at `nodeKey` with a paragraph and leaves the caret at
 * its end. `content` is appended to the fresh paragraph (the paste-as-link
 * flow's link-wrapped URL); `reuseEmptySibling` adopts an empty paragraph
 * immediately after the card instead of creating a new one (the close
 * flow's no-double-paragraph policy). A missing node is a no-op.
 */
export function $replaceCardWithParagraph(
  nodeKey: NodeKey,
  options: { content?: LexicalNode; reuseEmptySibling?: boolean } = {},
): void {
  const node = $getNodeByKey(nodeKey)
  if (!node) {
    return
  }

  if (options.reuseEmptySibling) {
    const nextSibling = node.getNextSibling()
    if (nextSibling && $isParagraphNode(nextSibling) && nextSibling.getTextContentSize() === 0) {
      node.remove()
      nextSibling.selectEnd()
      return
    }
  }

  const paragraph = $createParagraphNode()
  if (options.content) {
    paragraph.append(options.content)
  }
  node.replace(paragraph)
  paragraph.selectEnd()
}
