import type { ContentRow } from '@kobato/db/types'
import type { BodyProjections } from '@kobato/server/infra/lexical/lexical-projection'

export type ContentType = 'page' | 'post'

export interface SaveDraftInput {
  ownerId: number
  body: unknown
  imageSources: string[]
  headings: unknown
  projections?: BodyProjections | null
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
