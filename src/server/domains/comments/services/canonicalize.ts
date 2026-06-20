import { z } from 'zod'

import { prerenderInklingDocument } from '@/server/domains/inkling/prerender'
import { DomainError } from '@/server/infra/http/errors'
import { isInklingCommentEmpty } from '@/shared/inkling/comment-empty'
import { inklingCommentToMarkdown } from '@/shared/inkling/comment-markdown'
import { validateInklingDocumentForMode } from '@/shared/inkling/features'
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
  if (countHttpLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
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

function countHttpLinks(document: InklingDocument): number {
  let total = 0
  for (const block of document.root.children) {
    total += countLinksInBlock(block)
  }
  return total
}

function countLinksInBlock(block: InklingDocument['root']['children'][number]): number {
  switch (block.type) {
    case 'paragraph':
    case 'quote':
      return countLinksInInline(block.children)
    case 'list':
      return countLinksInList(block)
    case 'code-block':
    case 'math-block':
    case 'heading':
    case 'image-card':
    case 'music-card':
    case 'table':
    case 'horizontal-rule':
    case 'solution':
    case 'two-column':
    case 'footnote-definition':
      return 0
  }
}

function countLinksInList(list: { children: Array<{ children: unknown[] }> }): number {
  let total = 0
  for (const item of list.children) {
    for (const child of item.children) {
      if (isInlineNode(child)) {
        total += countLinksInInline([child])
      }
    }
  }
  return total
}

function countLinksInInline(nodes: readonly { type: string; url?: string; children?: readonly unknown[] }[]): number {
  let total = 0
  for (const node of nodes) {
    if (node.type === 'link' && typeof node.url === 'string' && /^https?:\/\//i.test(node.url)) {
      total += 1
    }
    if ('children' in node && Array.isArray(node.children)) {
      total += countLinksInInline(node.children)
    }
  }
  return total
}

function isInlineNode(value: unknown): value is { type: string; url?: string; children?: readonly unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof (value as { type: unknown }).type === 'string'
  )
}

function isDisallowedLinkUrl(url: string): boolean {
  return !isSafeUrl(url)
}

function hasDisallowedLinkUrl(document: InklingDocument): boolean {
  for (const block of document.root.children) {
    if (blockHasDisallowedLinkUrl(block)) {
      return true
    }
  }
  return false
}

function blockHasDisallowedLinkUrl(block: InklingDocument['root']['children'][number]): boolean {
  switch (block.type) {
    case 'paragraph':
    case 'quote':
      return inlineHasDisallowedLinkUrl(block.children)
    case 'list':
      return listHasDisallowedLinkUrl(block)
    case 'code-block':
    case 'math-block':
    case 'heading':
    case 'image-card':
    case 'music-card':
    case 'table':
    case 'horizontal-rule':
    case 'solution':
    case 'two-column':
    case 'footnote-definition':
      return false
  }
}

function listHasDisallowedLinkUrl(list: { children: Array<{ children: unknown[] }> }): boolean {
  for (const item of list.children) {
    for (const child of item.children) {
      if (isInlineNode(child) && inlineHasDisallowedLinkUrl([child])) {
        return true
      }
    }
  }
  return false
}

function inlineHasDisallowedLinkUrl(
  nodes: readonly { type: string; url?: string; children?: readonly unknown[] }[],
): boolean {
  for (const node of nodes) {
    if (node.type === 'link' && typeof node.url === 'string' && isDisallowedLinkUrl(node.url)) {
      return true
    }
    if ('children' in node && Array.isArray(node.children)) {
      if (inlineHasDisallowedLinkUrl(node.children)) {
        return true
      }
    }
  }
  return false
}
