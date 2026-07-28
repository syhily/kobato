/**
 * Content revision domain — shared primitives for post and page body
 * revisions. Both `post` and `page` own a `content` row chain; this
 * module holds the type definitions that cross the post/page boundary.
 */

import type { ContentRow } from '@/server/infra/db/types'

export type ContentType = 'page' | 'post'

export interface SaveDraftInput {
  ownerId: number
  body: unknown
  imageSources: string[]
  headings: unknown
  authorId: number | null
  expectedClientRevisionToken?: string | null
  force?: boolean
}

export type SaveDraftResult =
  | { status: 'saved'; row: ContentRow }
  | { status: 'conflict'; latest: ContentRow; expectedToken: string }

export interface PublishLatestInput extends SaveDraftInput {
  publishedAt?: Date
}

export type PublishLatestResult =
  | { status: 'published'; row: ContentRow }
  | { status: 'conflict'; latest: ContentRow; expectedToken: string }
