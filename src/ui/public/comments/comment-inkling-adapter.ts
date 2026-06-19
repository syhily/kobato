import type { InklingDocument } from '@/shared/inkling/schema'
import type { CommentBody } from '@/shared/pt/comment-schema'

import { EMPTY_INKLING_DOCUMENT } from '@/shared/inkling/empty'
import { commentPortableTextToInklingDocument, inklingDocumentToCommentBody } from '@/shared/inkling/migrate-pt'

/**
 * Temporary POC adapter: convert the legacy CommentBody (PortableText) into an
 * InklingDocument for the new Lexical comment editor. This keeps the server API
 * surface unchanged while the editor itself speaks Inkling JSON only.
 */
export function commentBodyToInklingDocument(body: CommentBody): InklingDocument {
  if (body.length === 0) {
    return EMPTY_INKLING_DOCUMENT
  }
  return commentPortableTextToInklingDocument(body)
}

/**
 * Temporary POC adapter: convert an InklingDocument produced by the comment
 * editor back into the legacy CommentBody expected by the server API.
 */
export function inklingDocumentToCommentBodyAdapter(document: InklingDocument): CommentBody {
  return inklingDocumentToCommentBody(document)
}
