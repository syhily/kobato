import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { eq, sql, getColumns } from 'drizzle-orm'

import type { PostMetaWithAuthor, ListPostsFilters } from '@/server/domains/posts/repos/shared'

import { buildPostsWhere, buildPostsOrderBy } from '@/server/domains/posts/repos/shared'
import { post as postMetaTable } from '@/server/infra/db/schema/post'
import { user } from '@/server/infra/db/schema/user'

export async function listPostMetas(db: NodePgDatabase, filters: ListPostsFilters = {}): Promise<PostMetaWithAuthor[]> {
  const where = buildPostsWhere(filters)
  const base = db
    .select({
      ...getColumns(postMetaTable),
      authorName: user.name,
    })
    .from(postMetaTable)
    .leftJoin(user, eq(user.id, postMetaTable.authorId))
    .orderBy(buildPostsOrderBy(filters))
  let q = where ? base.where(where) : base
  if (filters.limit !== undefined) {
    q = q.limit(filters.limit) as typeof q
  }
  if (filters.offset !== undefined && filters.offset > 0) {
    q = q.offset(filters.offset) as typeof q
  }
  return q
}

export async function countPostMetas(db: NodePgDatabase, filters: ListPostsFilters = {}): Promise<number> {
  const where = buildPostsWhere(filters)
  const builder = where
    ? db
        .select({ count: sql<number>`count(*)::int` })
        .from(postMetaTable)
        .where(where)
    : db.select({ count: sql<number>`count(*)::int` }).from(postMetaTable)
  const rows = await builder
  return rows[0]?.count ?? 0
}
