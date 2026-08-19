import { z } from 'zod'

import {
  codeBlockSchema,
  linkMarkDefSchema,
  mathBlockSchema,
  mathInlineMarkDefSchema,
  textBlockSchema,
} from '@/shared/pt/schema'

// Strict PortableText subset for comment bodies — the server perimeter validates every
// incoming body. Allowed: `normal` / `blockquote` styles, lists to level 4, `code` +
// `mathBlock`, markDefs `link` + `mathInline`, standard decorators.
const COMMENT_LIST_MAX_LEVEL = 4

const COMMENT_BLOCK_STYLES = ['normal', 'blockquote'] as const

const commentMarkDefSchema = z.discriminatedUnion('_type', [linkMarkDefSchema, mathInlineMarkDefSchema])

export const commentTextBlockSchema = textBlockSchema.extend({
  style: z.enum(COMMENT_BLOCK_STYLES).optional(),
  level: z.number().int().min(1).max(COMMENT_LIST_MAX_LEVEL).optional(),
  markDefs: z.array(commentMarkDefSchema).optional(),
})

export type CommentTextBlock = z.infer<typeof commentTextBlockSchema>

export const commentBlockSchema = z.discriminatedUnion('_type', [
  commentTextBlockSchema,
  codeBlockSchema,
  mathBlockSchema,
])

export type CommentBlock = z.infer<typeof commentBlockSchema>

export const commentBodySchema = z.array(commentBlockSchema)
export type CommentBody = z.infer<typeof commentBodySchema>

export function safeValidateCommentBody(
  value: unknown,
): { ok: true; body: CommentBody } | { ok: false; error: z.ZodError } {
  const result = commentBodySchema.safeParse(value)
  if (result.success) {
    return { ok: true, body: result.data }
  }
  return { ok: false, error: result.error }
}

export function isCommentBodyEmpty(body: CommentBody): boolean {
  if (body.length === 0) {
    return true
  }
  for (const block of body) {
    if (block._type === 'code' && block.code.trim().length > 0) {
      return false
    }
    if (block._type === 'mathBlock' && block.tex.trim().length > 0) {
      return false
    }
    if (block._type === 'block') {
      for (const span of block.children) {
        if (span.text.trim().length > 0) {
          return false
        }
      }
    }
  }
  return true
}
