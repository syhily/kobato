import type { AdminRevisionDto } from '@kobato/shared/contracts/revision.ts'

import { readStringArray } from '@kobato/shared/utils/tools.ts'

import type { ContentRow } from '../../infra/db/types'

import { readHeadings, readLexicalBody } from './projection-helpers'

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
