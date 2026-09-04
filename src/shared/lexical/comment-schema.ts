import { z } from 'zod'

import { COMMENT_NODE_TYPES } from '@/shared/lexical/node-whitelist'
import { buildLexicalEditorStateSchema } from '@/shared/lexical/schema'

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

export function safeValidateCommentEditorState(
  value: unknown,
): { ok: true; state: CommentEditorState } | { ok: false; error: z.ZodError } {
  const result = commentEditorStateSchema.safeParse(value)
  if (result.success) {
    return { ok: true, state: result.data }
  }
  return { ok: false, error: result.error }
}
