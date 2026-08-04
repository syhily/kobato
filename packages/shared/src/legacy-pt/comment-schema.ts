import {
  codeBlockSchema,
  linkMarkDefSchema,
  mathBlockSchema,
  mathInlineMarkDefSchema,
  textBlockSchema,
} from '@kobato/shared/legacy-pt/schema'
import { z } from 'zod'

// Strict PortableText subset accepted in comment bodies. Comments are
// authored through a deliberately-thin Tiptap editor (basic inline
// formatting + lists + blockquote + fenced code + math) — the editor
// UI is the first line of defence, but a malicious client could POST
// any JSON to the resource route, so the server perimeter validates
// every incoming body against this narrow schema before persisting.
//
// What's allowed vs. the full `portableTextBodySchema`:
//   - Text blocks: style `normal` or `blockquote` ONLY (no h1-h4).
//   - List items: `bullet` / `number` at levels 1-4 (matches editor).
//   - Custom blocks: `code` (fenced) and `mathBlock` (`$$…$$`).
//   - markDefs: `link` and `mathInline` only — `footnoteRef` is
//     intentionally excluded because comments don't carry a footnote
//     registry.
//   - Spans use the standard decorator set (`strong`, `em`,
//     `underline`, `code`, `strike-through`).
//
// What's NOT allowed (rejected at the perimeter):
//   - Headings (h1-h4) — comment threads aren't sectioned content.
//   - `image`, `horizontalRule`, `musicPlayer`,
//     `table`, `solution`, `twoColumn`, `footnoteDefinition`.

const COMMENT_LIST_MAX_LEVEL = 4

const COMMENT_BLOCK_STYLES = ['normal', 'blockquote'] as const

// markDef union for comment text blocks.
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

export function validateCommentBody(value: unknown): CommentBody {
  return commentBodySchema.parse(value)
}

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
