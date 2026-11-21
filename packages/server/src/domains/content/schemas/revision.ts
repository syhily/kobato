import type { ContentRow } from '@kobato/db/types'
import type { BodyProjections } from '@kobato/server/infra/lexical/lexical-projection'

export type ContentType = 'page' | 'post'

export interface SaveDraftInput {
  ownerId: number
  body: unknown
  imageSources: string[]
  headings: unknown
  /**
   * Save-time body projections. `null`/absent = leave the columns untouched on a
   * rewrite (the no-op short-circuit and the best-effort failure path both skip it).
   */
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
