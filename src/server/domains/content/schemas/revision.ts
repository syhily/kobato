/**
 * Shared revision primitives for post and page body revisions — the
 * types that cross the post/page boundary.
 */

import type { ContentRow } from '@/server/infra/db/types'
import type { BodyProjections } from '@/server/infra/pt/lexical-projection'

export type ContentType = 'page' | 'post'

export interface SaveDraftInput {
  ownerId: number
  body: unknown
  imageSources: string[]
  headings: unknown
  /**
   * Save-time body projections (plan round R9b). `null`/absent = leave the
   * columns untouched on a rewrite (the no-op short-circuit and the
   * best-effort failure path both skip the computation).
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
