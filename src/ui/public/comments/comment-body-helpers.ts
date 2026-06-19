import type { InklingDocument } from '@/shared/inkling/schema'

import { isInklingCommentEmpty } from '@/shared/inkling/comment-empty'

export function isInklingCommentBlank(document: InklingDocument): boolean {
  return isInklingCommentEmpty(document)
}
