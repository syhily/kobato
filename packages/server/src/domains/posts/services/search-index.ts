import type { Database } from '@kobato/db/database'
import type { ContentRow } from '@kobato/db/types'

import { removePostSearchIndex, upsertPostSearchIndex } from '@kobato/db/operations/post-search'
import { lexicalEditorStateSchema } from '@kobato/inkling/headless/schema'
import { computeBodyText } from '@kobato/server/infra/lexical/lexical-projection'

export async function indexPost(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  plainText: string,
): Promise<void> {
  upsertPostSearchIndex(db, postId, plainText)
}

export async function indexPostFromRevision(
  db: Database,
  postId: number,
  title: string,
  summary: string,
  revision: ContentRow,
): Promise<boolean> {
  let plainText = revision.bodyText
  if (plainText === null) {
    const parsed = lexicalEditorStateSchema.safeParse(revision.body)
    if (!parsed.success) {
      return false
    }
    plainText = computeBodyText(parsed.data)
  }
  await indexPost(db, postId, title, summary, plainText)
  return true
}

export { removePostSearchIndex as removePostIndex }
