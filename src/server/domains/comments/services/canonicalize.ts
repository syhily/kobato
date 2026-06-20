import { z } from 'zod'

import { prerenderInklingDocument } from '@/server/domains/inkling/prerender'
import { DomainError } from '@/server/infra/http/errors'
import { isInklingCommentEmpty } from '@/shared/inkling/comment-empty'
import { inklingCommentToMarkdown } from '@/shared/inkling/comment-markdown'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
import { collectLinkUrls, countHttpLinks as countDocHttpLinks } from '@/shared/inkling/links'
import { inklingDocumentSchema, type InklingDocument } from '@/shared/inkling/schema'
import { isSafeUrl } from '@/shared/sanitize-url'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

// Validate and prepare a comment Inkling body for persistence:
//   1. Parse the incoming JSON through `inklingDocumentSchema` so the
//      document envelope is structurally sound.
//   2. Enforce the narrower comment feature set (no headings, images,
//      music cards, tables, footnotes, etc.).
//   3. Reject empty / link-spam bodies.
//   4. Pre-render heavy assets (Shiki for `code-block`, KaTeX for
//      `math-block` and `inline-math`).
//   5. Serialise the canonical Inkling body back into markdown for the
//      `comment.content` rollback snapshot.
//
// On any validation failure, surface a `DomainError` so the resource
// route can translate it into a structured `ActionFailure` response.
export async function canonicalizeCommentBody(input: unknown): Promise<{ body: InklingDocument; content: string }> {
  let parsed: InklingDocument
  try {
    parsed = inklingDocumentSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError('BAD_REQUEST', '评论内容格式有误。')
    }
    throw error
  }

  const featureCheck = validateInklingDocumentForMode(parsed, 'comment')
  if (!featureCheck.ok) {
    throw new DomainError('BAD_REQUEST', '评论内容包含不允许的元素。')
  }

  if (hasDisallowedLinkUrl(parsed)) {
    throw new DomainError('BAD_REQUEST', '评论中的链接包含不安全的 URL。')
  }

  if (parsed.root.children.length > COMMENT_MAX_BLOCKS) {
    throw new DomainError('BAD_REQUEST', '评论内容过长，请精简后重试。')
  }
  if (isInklingCommentEmpty(parsed)) {
    throw new DomainError('BAD_REQUEST', '评论内容不能为空。')
  }
  if (countDocHttpLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
    throw new DomainError('BAD_REQUEST', `评论中链接过多（最多 ${COMMENT_MAX_HTTP_URLS} 个）。`)
  }

  const body = await prerenderInklingDocument(parsed)

  const revalidated = inklingDocumentSchema.safeParse(body)
  if (!revalidated.success) {
    throw new DomainError('BAD_REQUEST', '评论预渲染后格式异常。')
  }

  const content = inklingCommentToMarkdown(revalidated.data)
  return { body: revalidated.data, content }
}

function isDisallowedLinkUrl(url: string): boolean {
  return !isSafeUrl(url)
}

function hasDisallowedLinkUrl(document: InklingDocument): boolean {
  return collectLinkUrls(document).some(isDisallowedLinkUrl)
}
