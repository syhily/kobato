import type { InklingDocument } from '@/shared/inkling/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { inklingToPlainText } from '@/shared/inkling/plaintext'

export const EMPTY_COMMENT_BODY: CommentBody = []

export function isInklingCommentBlank(document: InklingDocument): boolean {
  return inklingToPlainText(document).trim().length === 0
}

export function isCommentBodyBlank(body: CommentBody): boolean {
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
