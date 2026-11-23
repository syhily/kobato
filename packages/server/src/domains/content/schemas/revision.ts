import type { ContentRow } from '@kobato/db/sqlite/types'
import type { BodyProjections } from '@kobato/server/infra/lexical/lexical-projection'

import { areLexicalEditorStatesEquivalent } from '@kobato/inkling/headless/equivalence'
import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { isDeepStrictEqual } from 'node:util'

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

export function isEquivalentToPublishedLatest(
  latest: ContentRow | undefined,
  input: Pick<SaveDraftInput, 'body' | 'imageSources' | 'headings'>,
): latest is ContentRow {
  if (latest?.status !== 'published') {
    return false
  }
  const inputBody = lexicalEditorStateSchema.safeParse(input.body)
  const latestBody = lexicalEditorStateSchema.safeParse(latest.body)
  return (
    inputBody.success &&
    latestBody.success &&
    areLexicalEditorStatesEquivalent(inputBody.data, latestBody.data) &&
    isDeepStrictEqual(input.imageSources, latest.imageSources) &&
    isDeepStrictEqual(input.headings, latest.headings)
  )
}
