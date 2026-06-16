import type { CommentBody } from '@/shared/pt/comment-schema'

export const EMPTY_COMMENT_BODY: CommentBody = []

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
