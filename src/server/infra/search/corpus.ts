import { sql, type SQL } from 'drizzle-orm'

import { likeEscape } from '@/server/infra/db/like-escape'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

/**
 * The single definition of which post text is searchable; the LIKE
 * disjuncts map over this list.
 */
const corpusFields = [post.title, post.summary, sql`COALESCE(${postSearchIndex.plainText}, '')`]

/**
 * Verbatim-substring LIKE disjuncts over the corpus — the whole result
 * set.
 */
export function corpusLikeDisjuncts(query: string): SQL[] {
  return corpusFields.map((field) => likeEscape(field, query))
}
