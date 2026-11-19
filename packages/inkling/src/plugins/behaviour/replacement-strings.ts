import { TextNode } from 'lexical'

const REPLACEMENT_STRING_REGEX = /\{(\w*?)(?:,? *"(.*?)")?\}/
const REPLACEMENT_STRING_SPLIT_REGEX = /({.*?})/g

export function $replacementStringTransform(node: TextNode): void {
  if (node.hasFormat('code')) {
    return
  }
  const textContent = node.getTextContent()
  const replacementString = REPLACEMENT_STRING_REGEX.exec(textContent)?.[0]

  if (!replacementString) {
    return
  }
  const splitContent = textContent.split(REPLACEMENT_STRING_SPLIT_REGEX).filter((e: string) => e !== '')

  for (let index = splitContent.length - 1; index >= 0; index -= 1) {
    const text = splitContent[index]
    const newNode = new TextNode(text)
    if (text === replacementString) {
      newNode.setFormat('code')
      newNode.select()
    }
    node.insertAfter(newNode)
  }
  node.remove()
}
