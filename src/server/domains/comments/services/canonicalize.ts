import { z } from 'zod'

import type { CommentBody } from '@/shared/pt/comment-schema'

import { DomainError } from '@/server/infra/http/errors'
import { prerenderPortableTextBody } from '@/server/infra/pt/prerender'
import { commentBodyToMarkdown } from '@/shared/pt/comment-markdown'
import { commentBodySchema, isCommentBodyEmpty } from '@/shared/pt/comment-schema'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

// Validate and prepare a comment body for persistence: parse the comment
// dialect, reject empty/link-spam bodies, pre-render heavy assets, and
// serialize markdown for the `comment.content` snapshot. Failures → DomainError.
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

  // Strip client-supplied pre-rendered fields (stored XSS); server re-generates them.
  stripClientRenderedFields(parsed)

  const body = await prerenderPortableTextBody(parsed)
  const revalidated = commentBodySchema.safeParse(body)
  if (!revalidated.success) {
    throw new DomainError('BAD_REQUEST', '评论预渲染后格式异常。')
  }
  const content = commentBodyToMarkdown(revalidated.data)
  return { body: revalidated.data, content }
}

function stripClientRenderedFields(body: CommentBody): void {
  for (const block of body) {
    if (block._type === 'code') {
      block.highlightedHtml = undefined
    }
    if (block._type === 'mathBlock') {
      block.mathml = undefined
      block.svg = undefined
    }
    if (block._type === 'block' && Array.isArray(block.markDefs)) {
      for (const def of block.markDefs) {
        if (def._type === 'mathInline') {
          def.mathml = undefined
          def.svg = undefined
        }
      }
    }
  }
}

function countLinks(body: CommentBody): number {
  // Only http(s) URLs count — Tiptap autolinks email addresses as `mailto:`.
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
