import type { LexicalEditorState, LexicalNodeJson } from '@kobato/inkling-internal/headless/schema'

import { unsafeCast } from '@kobato/utils/unsafe-cast'

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

export function lexicalNodeTextContent(node: LexicalNodeJson): string {
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
