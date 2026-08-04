import type { LexicalCommentBody } from '@kobato/shared/lexical/comment-schema'

import { DomainError } from '@kobato/server/infra/http/errors'
import { prerenderLexicalBody } from '@kobato/server/infra/lexical/prerender'
import { commentBodySchema } from '@kobato/shared/legacy-pt/comment-schema'
import { canonicalizeLexicalCommentBodyShape } from '@kobato/shared/lexical/comment-canonicalize'
import { commentBodyToMarkdown } from '@kobato/shared/lexical/comment-markdown'
import { isLexicalCommentBodyBlank, safeParseLexicalCommentBody } from '@kobato/shared/lexical/comment-schema'
import { convertPtBodyToLexical } from '@kobato/shared/lexical/mapping'
import { visitLexicalNodes } from '@kobato/shared/lexical/walk'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { z } from 'zod'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

// Validate and prepare a comment body for persistence — the Lexical
// replacement of the PT `canonicalizeCommentBody`:
//   1. DUAL-SHAPE input gate until the migration lands (R6): the PT
//      shape (`Array.isArray` — the tiptap editor's wire format) is
//      validated through `commentBodySchema` and converted through the
//      one-way PT→Lexical mapping; the Lexical shape runs the
//      `lexicalCommentBodySchema` gate. Both then canonicalize through
//      `canonicalizeLexicalCommentBodyShape` (quote normalization, zod
//      gate + headless parse, deterministic serialized form).
//   2. Reject empty / link-spam bodies. The old markdown pipeline
//      counted `https?://` substrings in raw text; the PT equivalent
//      walked `link` markDefs and the Lexical walk counts `link` nodes
//      (the only way the editor produces URLs) to keep the
//      spam-prevention spirit intact.
//   3. Pre-render heavy assets (Shiki for `code` blocks, KaTeX for
//      `mathBlock` and `mathInline` nodes) through the shared Lexical
//      prerender — same policy as the post/page path.
//   4. Serialise the canonical Lexical body back into markdown for the
//      `comment.content` rollback snapshot.
//
// On any validation failure, surface a `DomainError` so the resource
// route can translate it into a structured `ActionFailure` response.
export async function canonicalizeCommentBody(input: unknown): Promise<{ body: LexicalCommentBody; content: string }> {
  let parsed: LexicalCommentBody
  try {
    parsed = parseCommentBodyWithGate(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError('BAD_REQUEST', '评论内容格式有误。')
    }
    throw error
  }

  if (parsed.root.children.length > COMMENT_MAX_BLOCKS) {
    throw new DomainError('BAD_REQUEST', '评论内容过长，请精简后重试。')
  }
  if (isLexicalCommentBodyBlank(parsed)) {
    throw new DomainError('BAD_REQUEST', '评论内容不能为空。')
  }
  if (countLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
    throw new DomainError('BAD_REQUEST', `评论中链接过多（最多 ${COMMENT_MAX_HTTP_URLS} 个）。`)
  }

  // Strip any client-supplied pre-rendered fields to prevent stored XSS.
  // The server will re-generate these from tex/code after this call.
  stripClientRenderedFields(parsed)

  const body = await prerenderLexicalBody(unsafeCast<Parameters<typeof prerenderLexicalBody>[0]>(parsed))
  const revalidated = safeParseLexicalCommentBody(body)
  if (!revalidated.ok) {
    throw new DomainError('BAD_REQUEST', '评论预渲染后格式异常。')
  }
  const content = commentBodyToMarkdown(revalidated.body)
  return { body: revalidated.body, content }
}

/** Dual-shape input gate: PT (tiptap editor) converts, Lexical validates, both canonicalize. */
function parseCommentBodyWithGate(input: unknown): LexicalCommentBody {
  if (Array.isArray(input)) {
    const pt = commentBodySchema.safeParse(input)
    if (!pt.success) {
      throw pt.error
    }
    return canonicalizeLexicalCommentBodyShape(convertPtBodyToLexical(pt.data))
  }
  const parsed = safeParseLexicalCommentBody(input)
  if (!parsed.ok) {
    throw parsed.error
  }
  return canonicalizeLexicalCommentBodyShape(parsed.body)
}

function stripClientRenderedFields(body: LexicalCommentBody): void {
  visitLexicalNodes(body, (node) => {
    if (node.type === 'code') {
      delete node.highlightedHtml
      return
    }
    if (node.type === 'mathBlock' || node.type === 'mathInline') {
      delete node.mathml
      delete node.svg
    }
  })
}

function countLinks(body: LexicalCommentBody): number {
  // Only count http(s) URLs. The comment editor's autolink / link
  // insertion produces LinkNodes — including `mailto:` for bare email
  // addresses, which must not count as a URL (a legitimate "email me at
  // x@y" reply would otherwise flag as spam).
  let total = 0
  visitLexicalNodes(body, (node) => {
    if (node.type === 'link' && /^https?:\/\//i.test(node.url)) {
      total += 1
    }
  })
  return total
}
