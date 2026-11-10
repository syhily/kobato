import { z } from 'zod'

import { COMMENT_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { buildLexicalEditorStateSchema } from '@/shared/lexical/schema'
import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Restricted Lexical state for comment bodies — the server perimeter validates
// every incoming body. Capability set: multi-paragraph, blockquote, nested
// lists, code block, math block, link, math-inline (node whitelist in
// node-whitelist.ts).

/** List nesting cap: counts `list` nodes on the ancestor chain. */
export const COMMENT_LIST_MAX_DEPTH = 4

export const commentEditorStateSchema = buildLexicalEditorStateSchema({
  allowedTypes: COMMENT_NODE_TYPES,
  maxListDepth: COMMENT_LIST_MAX_DEPTH,
})

export type CommentEditorState = z.infer<typeof commentEditorStateSchema>

/** The comment form's reset/empty value: a single empty paragraph, valid for
 * both the schema parse and the composer's canonical blank. The cast bridges
 * the erased `LexicalNodeJson` child type (type + version only). */
export const EMPTY_COMMENT_EDITOR_STATE: CommentEditorState = unsafeCast<CommentEditorState>({
  root: {
    type: 'root',
    version: 1,
    direction: 'ltr',
    format: '',
    indent: 0,
    children: [{ type: 'paragraph', version: 1, children: [], direction: 'ltr', format: '', indent: 0 }],
  },
})

export function safeValidateCommentEditorState(
  value: unknown,
): { ok: true; state: CommentEditorState } | { ok: false; error: z.ZodError } {
  const result = commentEditorStateSchema.safeParse(value)
  if (result.success) {
    return { ok: true, state: result.data }
  }
  return { ok: false, error: result.error }
}

/**
 * Cheap pre-render length bound for the server perimeter: counts only text
 * that survives into the degraded-HTML projection, so exceeding the cap here
 * guarantees exceeding it on the rendered side — one tree walk instead of a
 * jsdom render of a body the 10 MB perimeter limit allows.
 */
export function commentEditorStateTextLength(state: CommentEditorState): number {
  let total = 0
  visitLexicalNodes(state, (node) => {
    const text = unsafeCast<{ text?: unknown }>(node).text
    if (typeof text === 'string') {
      total += text.length
      return
    }
    if (node.type === 'linebreak') {
      total += 1
      return
    }
    const dataset = unsafeCast<{ code?: unknown; tex?: unknown }>(node)
    if (typeof dataset.code === 'string') {
      total += dataset.code.length
    }
    if (typeof dataset.tex === 'string') {
      total += dataset.tex.length
    }
  })
  return total
}

/**
 * Blank check (submit gating on both the comment form and the server
 * perimeter): a comment is blank when no text content survives trimming and
 * every codeblock `code` / math `tex` payload is empty.
 */
export function isCommentEditorStateBlank(state: CommentEditorState): boolean {
  let blank = true
  visitLexicalNodes(state, (node) => {
    if (!blank) {
      return
    }
    if (lexicalNodeTextContent(node).trim().length > 0) {
      blank = false
      return
    }
    const dataset = unsafeCast<{ code?: unknown; tex?: unknown }>(node)
    if (typeof dataset.code === 'string' && dataset.code.trim().length > 0) {
      blank = false
    }
    if (typeof dataset.tex === 'string' && dataset.tex.trim().length > 0) {
      blank = false
    }
  })
  return blank
}
