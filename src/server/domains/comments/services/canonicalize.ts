import { lexicalStateToPlainText } from '@inkling/editor/headless'
import { z } from 'zod'

import type { CommentEditorState } from '@/shared/lexical/comment-schema'

import { DomainError } from '@/server/infra/http/errors'
import { prerenderLexicalEditorState } from '@/server/infra/pt/lexical-prerender'
import { computeCommentContentProjection } from '@/server/infra/pt/lexical-projection'
import { SERVER_FILLED_NODE_FIELDS } from '@/shared/lexical/artifacts'
import { commentEditorStateSchema, isCommentEditorStateBlank } from '@/shared/lexical/comment-schema'
import { visitLexicalNodes } from '@/shared/lexical/walk'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

// Validate and prepare a comment body for persistence (R12, plan
// docs/plans/inkling-editor-replacement.md): parse the comment Lexical
// dialect, reject empty/link-spam bodies, strip forged server-rendered
// artifact slots, re-prerender them server-side, and project the
// feed-variant degraded HTML for the `comment.content` snapshot. Failures →
// DomainError.
export async function canonicalizeCommentBody(input: unknown): Promise<{ body: CommentEditorState; content: string }> {
  let parsed: CommentEditorState
  try {
    parsed = commentEditorStateSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError('BAD_REQUEST', '评论内容格式有误。')
    }
    throw error
  }

  if (parsed.root.children.length > COMMENT_MAX_BLOCKS) {
    throw new DomainError('BAD_REQUEST', '评论内容过长，请精简后重试。')
  }
  if (isCommentEditorStateBlank(parsed)) {
    throw new DomainError('BAD_REQUEST', '评论内容不能为空。')
  }
  if (countLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
    throw new DomainError('BAD_REQUEST', `评论中链接过多（最多 ${COMMENT_MAX_HTTP_URLS} 个）。`)
  }

  // Strip client-supplied pre-rendered fields (stored XSS); server re-generates them.
  stripServerFilledFields(parsed)

  const body = await prerenderLexicalEditorState(parsed)
  const revalidated = commentEditorStateSchema.safeParse(body)
  if (!revalidated.success) {
    throw new DomainError('BAD_REQUEST', '评论预渲染后格式异常。')
  }

  // Dual-column consistency: `content` is projected from the SAME canonical
  // state that is stored in `body`. The degraded-HTML projection is
  // best-effort — a comment save must never fail because the render did, so
  // a render failure degrades to the DOM-free plain-text snapshot.
  let content: string
  try {
    content = await computeCommentContentProjection(revalidated.data)
  } catch {
    content = lexicalStateToPlainText(revalidated.data)
  }
  return { body: revalidated.data, content }
}

function stripServerFilledFields(state: CommentEditorState): void {
  visitLexicalNodes(state, (node) => {
    const keys = SERVER_FILLED_NODE_FIELDS[node.type]
    if (keys === undefined) {
      return
    }
    const record = node as Record<string, unknown>
    for (const key of keys) {
      // codeblock / math / math-inline: the comment schema declares the
      // artifact slots as required strings, so they reset to empty rather
      // than being deleted (the music-player delete branch of the article
      // canonicalizer is unreachable here — comments register no host cards).
      record[key] = ''
    }
  })
}

function countLinks(state: CommentEditorState): number {
  // Only http(s) URLs count — typed email addresses autolink as `mailto:`.
  let total = 0
  visitLexicalNodes(state, (node) => {
    if (node.type !== 'link' && node.type !== 'autolink') {
      return
    }
    const url = (node as Record<string, unknown>).url
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      total += 1
    }
  })
  return total
}
