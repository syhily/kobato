import { sql, type SQL } from 'drizzle-orm'

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

/**
 * The search corpus — the single definition of "which text a post is
 * searched by". The LIKE disjuncts map over this field list, so adding a
 * corpus field (e.g. tags) is a deliberate single edit here.
 */
const corpusFields = [post.title, post.summary, sql`COALESCE(${postSearchIndex.plainText}, '')`]

/**
 * Verbatim-substring ILIKE disjuncts over the corpus — the whole result
 * set. Search is LIKE-only: verbatim substring match, newest first.
 */
export function corpusIlikeDisjuncts(query: string): SQL[] {
  return corpusFields.map((field) => ilikeEscape(field, query))
}
