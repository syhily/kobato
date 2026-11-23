import type { AdminRevisionDto } from '@kobato/api/contracts/revision'
import type { ContentRow } from '@kobato/db/sqlite/types'

import { readHeadings, readLexicalBody } from '@kobato/server/domains/content/projection-read'
import { readStringArray } from '@kobato/server/infra/coerce'

export function toAdminRevisionDto(row: ContentRow): AdminRevisionDto {
  return {
    id: String(row.id),
    revisionNo: row.revisionNo,
    status: row.status === 'published' ? 'published' : 'draft',
    body: readLexicalBody(row.body),
    imageSources: readStringArray(row.imageSources),
    headings: readHeadings(row.headings),
    authorId: row.authorId === null ? null : String(row.authorId),
    clientRevisionToken: row.clientRevisionToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
