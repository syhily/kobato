import { $createParagraphNode, $getNodeByKey, $isParagraphNode, type LexicalNode, type NodeKey } from 'lexical'
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
