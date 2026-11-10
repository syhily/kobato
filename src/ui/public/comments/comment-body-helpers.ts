// Comment bodies are stored as a Lexical editor state (`@/shared/lexical/comment-schema`).

import type { LexicalEditorState } from '@/shared/lexical/schema'

import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Plain-text projection for snippets and the reply overlay. Lexical states walk
 * leaf-only, with decorator code/tex payloads standing in for their visible content.
 */
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
