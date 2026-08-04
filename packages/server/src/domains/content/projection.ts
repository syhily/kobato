import type { ContentRow } from '@kobato/server/infra/db/types'
import type { AdminRevisionDto } from '@kobato/shared/contracts/revision'

import { readBody, readHeadings } from '@kobato/server/domains/content/projection-helpers'
import { readStringArray } from '@kobato/shared/utils/tools'

export function toAdminRevisionDto(row: ContentRow): AdminRevisionDto {
  return {
    id: String(row.id),
    revisionNo: row.revisionNo,
    status: row.status === 'published' ? 'published' : 'draft',
    body: readBody(row.body),
    imageSources: readStringArray(row.imageSources),
    headings: readHeadings(row.headings),
    authorId: row.authorId === null ? null : String(row.authorId),
    clientRevisionToken: row.clientRevisionToken,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
