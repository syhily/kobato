import { z } from 'zod'

import { COMMENT_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { buildLexicalEditorStateSchema } from '@/shared/lexical/schema'
import { lexicalNodeTextContent, visitLexicalNodes } from '@/shared/lexical/walk'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

// Restricted Lexical state for comment bodies — the server perimeter
// validates every incoming body. Mirrors the PT `comment-schema.ts`
// capability set: multi-paragraph, blockquote, nested lists, code block,
// math block, link, math-inline (node whitelist in node-whitelist.ts).

/** Mirrors the PT comment cap (`comment-schema.ts`'s level ≤ 4). The
 * Lexical version counts `list` nodes on the ancestor chain — the
 * list > listitem > list nesting depth. */
export const COMMENT_LIST_MAX_DEPTH = 4

export const commentEditorStateSchema = buildLexicalEditorStateSchema({
  allowedTypes: COMMENT_NODE_TYPES,
  maxListDepth: COMMENT_LIST_MAX_DEPTH,
})

export type CommentEditorState = z.infer<typeof commentEditorStateSchema>

/** The comment form's reset/empty value — a single empty paragraph so the
 * state is both a valid `commentEditorStateSchema` parse target and the
 * composer's canonical blank. Element nodes carry their full serialized
 * field set (children/direction/format/indent are schema-required); the cast
 * bridges the erased `LexicalNodeJson` child type (type + version only). */
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
 * Blank check (submit gating on both the comment form and the server
 * perimeter): a comment is blank when no text content survives trimming and
 * every codeblock `code` / math `tex` payload is empty. Mirrors the PT
 * `isCommentBodyEmpty` semantics.
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
