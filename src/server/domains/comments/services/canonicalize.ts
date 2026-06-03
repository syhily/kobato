import { z } from 'zod'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { DomainError } from '@/server/infra/http/errors'
import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'
import { commentBodyToMarkdown } from '@/shared/pt/comment-markdown'
import { commentBodySchema, isCommentBodyEmpty } from '@/shared/pt/comment-schema'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

// Validate and prepare a comment body for persistence:
//   1. Parse the incoming JSON through `commentBodySchema` so the
//      narrow comment dialect is enforced at the API perimeter.
//   2. Reject empty / link-spam bodies. The old markdown pipeline
//      counted `https?://` substrings in raw text; the PT equivalent
//      walks `link` markDefs (the only way the editor produces URLs)
//      to keep the spam-prevention spirit intact.
//   3. Pre-render heavy assets (Shiki for `code` blocks, KaTeX for
//      `mathBlock` and `mathInline` markDefs). The renderer is
//      shared with posts / pages and already no-ops for block types
//      the comment dialect doesn't permit.
//   4. Serialise the canonical PT body back into markdown for the
//      `comment.content` rollback snapshot.
//
// On any validation failure, surface a `DomainError` so the resource
// route can translate it into a structured `ActionFailure` response.
export async function canonicalizeCommentBody(input: unknown): Promise<{ body: CommentBody; content: string }> {
  let parsed: CommentBody
  try {
    parsed = commentBodySchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError('BAD_REQUEST', '评论内容格式有误。')
    }
    throw error
  }

  if (parsed.length > COMMENT_MAX_BLOCKS) {
    throw new DomainError('BAD_REQUEST', '评论内容过长，请精简后重试。')
  }
  if (isCommentBodyEmpty(parsed)) {
    throw new DomainError('BAD_REQUEST', '评论内容不能为空。')
  }
  if (countLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
    throw new DomainError('BAD_REQUEST', `评论中链接过多（最多 ${COMMENT_MAX_HTTP_URLS} 个）。`)
  }

  const body = await prerenderPortableTextBody(parsed)
  const content = commentBodyToMarkdown(body as CommentBody)
  return { body: body as CommentBody, content }
}

function countLinks(body: CommentBody): number {
  // Only count http(s) URLs. Tiptap's `Link` extension autolinks
  // anything URL-shaped — including bare email addresses, which it
  // turns into `mailto:user@example.com` markDefs. Treating those as
  // URLs would flag a perfectly legitimate "feel free to email me at
  // x@y" reply as spam.
  let total = 0
  for (const block of body) {
    if (block._type !== 'block') {
      continue
    }
    for (const def of block.markDefs ?? []) {
      if (def._type === 'link' && /^https?:\/\//i.test(def.href)) {
        total += 1
      }
    }
  }
  return total
}
