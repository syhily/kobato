/**
 * The replacement-strings grammar, headless so the transform is a
 * synchronous test table (the plugin keeps only the two transform
 * registrations — TextNode always, ExtendedTextNode when the editor has
 * it). A `{var}` or `{var, "default"}` placeholder typed as plain text is
 * split out into its own code-formatted text node and selected; the code
 * format doubles as the re-entrancy guard (a formatted node never
 * re-matches, so the transform cannot loop).
 */

import { TextNode } from 'lexical'

const REPLACEMENT_STRING_REGEX = /\{(\w*?)(?:,? *"(.*?)")?\}/
const REPLACEMENT_STRING_SPLIT_REGEX = /({.*?})/g

export function $replacementStringTransform(node: TextNode): void {
  if (node.hasFormat('code')) {
    // prevent infinite loop
    return
  }
  const textContent = node.getTextContent()
  const replacementString = REPLACEMENT_STRING_REGEX.exec(textContent)?.[0]

  if (!replacementString) {
    return
  }
  // split the text content into an array including the matched string
  const splitContent = textContent.split(REPLACEMENT_STRING_SPLIT_REGEX).filter((e: string) => e !== '')

  // create a new text node for each string in the array, last first (an
  // index walk, not .reverse(): the ES2022 lib has no toReversed and the
  // mutating reverse trips unicorn/no-array-reverse)
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
