import { likeEscape } from '@kobato/db/like-escape.ts'
import { postSearchIndex } from '@kobato/db/schema/content.ts'
import { post } from '@kobato/db/schema/post.ts'
import { sql, type SQL } from 'drizzle-orm'

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
