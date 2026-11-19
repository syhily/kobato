import { COMMENT_NODE_TYPES } from '@kobato/inkling-internal/headless/node-whitelist.ts'
import { buildLexicalEditorStateSchema } from '@kobato/inkling-internal/headless/schema.ts'
import { lexicalNodeTextContent, visitLexicalNodes } from '@kobato/inkling-internal/headless/walk.ts'
import { unsafeCast } from '@kobato/utils/unsafe-cast.ts'
import { z } from 'zod'

export const COMMENT_LIST_MAX_DEPTH = 4

export const commentEditorStateSchema = buildLexicalEditorStateSchema({
  allowedTypes: COMMENT_NODE_TYPES,
  maxListDepth: COMMENT_LIST_MAX_DEPTH,
})

export type CommentEditorState = z.infer<typeof commentEditorStateSchema>

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
