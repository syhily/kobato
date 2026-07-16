import type { SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, desc, eq, gt, or } from 'drizzle-orm'

import type { SearchSettings } from '@/shared/config/types'

import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { corpusIlikeDisjuncts, corpusTrgmScore } from '@/server/infra/search/corpus'

// Trigram mode — pg_trgm word_similarity ranking over the corpus, with
// the ILIKE disjuncts kept as a verbatim-substring recall floor.

export interface TrgmSearchPlan {
  score: SQL<number>
  where: SQL | undefined
  orderBy: SQL[]
}

export function trgmSearchPlan(baseWhere: SQL, query: string, threshold: number): TrgmSearchPlan {
  const score = corpusTrgmScore(query)
  return {
    score,
    // The ILIKE disjuncts preserve LIKE-mode recall exactly (verbatim
    // substrings, 1–2-char queries that word_similarity can't trigram);
    // the threshold disjunct is what adds fuzzy matches on top. The GIN
    // index on plain_text accelerates the ILIKE side.
    where: and(baseWhere, or(gt(score, threshold), ...corpusIlikeDisjuncts(query))),
    orderBy: [desc(score), desc(post.publishedAt)],
  }
}

export async function runTrgmSearch(
  db: NodePgDatabase,
  baseWhere: SQL,
  query: string,
  threshold: number,
): Promise<string[]> {
  const plan = trgmSearchPlan(baseWhere, query, threshold)
  const rows = await db
    .select({ slug: post.slug, score: plan.score })
    .from(post)
    .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
    .where(plan.where)
    .orderBy(...plan.orderBy)

  getLogger('search.trgm').info('Search trigram results', {
    query,
    rawRows: rows.length,
    threshold,
    topScore: rows[0]?.score ?? null,
  })

  return rows.map((r) => r.slug)
}

// The trgm threshold changes the fuzzy-match result set; the vector
// similarity threshold does not and must NOT be hashed here.
export function trgmCacheKeyParts(settings: SearchSettings['search'], query: string): string[] {
  return [settings.mode, query, String(settings.trgmThreshold)]
}
