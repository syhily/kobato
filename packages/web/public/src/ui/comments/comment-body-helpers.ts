import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { lexicalNodeTextContent, visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export function commentBodyPlainText(body: unknown): string {
  const state = unsafeCast<LexicalEditorState>(body)
  const parts: string[] = []
  visitLexicalNodes(state, (node) => {
    if (node.children !== undefined && node.children.length > 0) {
      return
    }
    const text = lexicalNodeTextContent(node)
    if (text.trim().length > 0) {
      parts.push(text)
      return
    }
    const dataset = unsafeCast<{ code?: unknown; tex?: unknown }>(node)
    if (node.type === 'codeblock' && typeof dataset.code === 'string' && dataset.code.trim().length > 0) {
      parts.push(dataset.code)
    }
    if (
      (node.type === 'math' || node.type === 'math-inline') &&
      typeof dataset.tex === 'string' &&
      dataset.tex.trim().length > 0
    ) {
      parts.push(dataset.tex)
    }
  })
  return parts.join('\n').trim()
}
