import type { CommentEditorState } from '@kobato/inkling/headless/comment-schema.ts'

import { lexicalStateToPlainText } from '@kobato/inkling/headless'
import { SERVER_FILLED_NODE_FIELDS } from '@kobato/inkling/headless/artifacts.ts'
import {
  commentEditorStateSchema,
  commentEditorStateTextLength,
  isCommentEditorStateBlank,
} from '@kobato/inkling/headless/comment-schema.ts'
import { compactLexicalEditorState } from '@kobato/inkling/headless/dialect.ts'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk.ts'
import { decideContentLengthGate } from '@kobato/server/domains/comments/services/policy.ts'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { DomainError } from '@kobato/server/infra/http/errors.ts'
import { prerenderLexicalEditorState } from '@kobato/server/infra/lexical/lexical-prerender.ts'
import { computeCommentContentProjection } from '@kobato/server/infra/lexical/lexical-projection.ts'
import { z } from 'zod'

const COMMENT_MAX_BLOCKS = 200
const COMMENT_MAX_HTTP_URLS = 3

export async function canonicalizeCommentBody(input: unknown): Promise<{ body: CommentEditorState; content: string }> {
  let parsed: CommentEditorState
  try {
    parsed = commentEditorStateSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.bodyInvalid'))
    }
    throw error
  }

  if (parsed.root.children.length > COMMENT_MAX_BLOCKS) {
    throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.tooLongRetry'))
  }
  if (isCommentEditorStateBlank(parsed)) {
    throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.empty'))
  }
  if (countLinks(parsed) > COMMENT_MAX_HTTP_URLS) {
    throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.tooManyLinks', { max: COMMENT_MAX_HTTP_URLS }))
  }

  const lengthFailure = decideContentLengthGate(commentEditorStateTextLength(parsed))
  if (lengthFailure !== null) {
    throw new DomainError(lengthFailure.code, lengthFailure.descriptor)
  }

  stripServerFilledFields(parsed)

  const body = await prerenderLexicalEditorState(parsed)
  const revalidated = commentEditorStateSchema.safeParse(body)
  if (!revalidated.success) {
    throw new DomainError('BAD_REQUEST', descriptorFor('comments.error.prerenderInvalid'))
  }

  let content: string
  try {
    content = await computeCommentContentProjection(revalidated.data)
  } catch {
    content = lexicalStateToPlainText(revalidated.data)
  }
  return { body: compactLexicalEditorState(revalidated.data), content }
}

function stripServerFilledFields(state: CommentEditorState): void {
  visitLexicalNodes(state, (node) => {
    const keys = SERVER_FILLED_NODE_FIELDS[node.type]
    if (keys === undefined) {
      return
    }
    const record = node as Record<string, unknown>
    for (const key of keys) {
      record[key] = ''
    }
  })
}

function countLinks(state: CommentEditorState): number {
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
