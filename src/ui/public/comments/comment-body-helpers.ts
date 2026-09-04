// Comment body helpers (R12): the comment body is now a Lexical editor state
// (`@/shared/lexical/comment-schema`). Rendering switched to the stored
// `content` HTML column in R13, but this plain-text helper still reads the
// body column, where rows written before the switch remain PortableText
// arrays — it handles BOTH shapes until the body backfill lands.

import type { LexicalEditorState } from '@/shared/lexical/schema'
import type { PortableTextBody } from '@/shared/pt/schema'

import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { bodyToPlainText } from '@/shared/pt/utils'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * Plain-text projection for snippets and the reply overlay. Accepts
 * `unknown` because pre-switch rows can still be PT arrays (routed to the
 * legacy `bodyToPlainText`); Lexical states are walked leaf-only, with
 * decorator code/tex payloads standing in for their visible content (parity
 * with the PT projection, which emitted code block code and mathBlock tex).
 */
export function commentBodyPlainText(body: unknown): string {
  if (Array.isArray(body)) {
    return bodyToPlainText(unsafeCast<PortableTextBody>(body))
  }
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
