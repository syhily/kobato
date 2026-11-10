import type { LexicalEditorState, LexicalNodeJson } from '@/shared/lexical/schema'

import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Depth-first pre-order traversal with an explicit stack (recursion-free, like
// the schema's policy walk). Validated states are depth-capped by
// MAX_TREE_DEPTH, so `lexicalNodeTextContent`'s recursion is safe.

/**
 * Depth-first pre-order visit over every descendant of `root` (the root
 * itself is not visited) in document order — the same order inkling's HTML
 * renderer walks the tree.
 */
export function visitLexicalNodes(state: LexicalEditorState, visit: (node: LexicalNodeJson) => void): void {
  const stack: LexicalNodeJson[] = []
  for (let i = state.root.children.length - 1; i >= 0; i -= 1) {
    stack.push(state.root.children[i]!)
  }
  while (stack.length > 0) {
    const node = stack.pop()
    if (!node) {
      continue
    }
    visit(node)
    const children = node.children
    if (children !== undefined) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]!)
      }
    }
  }
}

/**
 * Serialized-state equivalent of Lexical's `node.getTextContent()`: text
 * nodes contribute `text`, `linebreak` `'\n'`, elements their children,
 * decorators nothing (MathInlineNode returns `''` and no whitelisted decorator
 * overrides it). Heading slug parity depends on matching inkling's heading
 * transformer byte-for-byte.
 */
export function lexicalNodeTextContent(node: LexicalNodeJson): string {
  // `text` is a per-variant field the shared node type does not model; the
  // zod schema pins it as a string on text nodes.
  const text = unsafeCast<{ text?: unknown }>(node).text
  if (typeof text === 'string') {
    return text
  }
  if (node.type === 'linebreak') {
    return '\n'
  }
  let out = ''
  for (const child of node.children ?? []) {
    out += lexicalNodeTextContent(child)
  }
  return out
}
