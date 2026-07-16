import { sql, type SQL } from 'drizzle-orm'

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'

/**
 * The search corpus — the single definition of "which text a post is
 * searched by". Every read side maps over this field list (the LIKE
 * disjuncts via `corpusIlikeDisjuncts`, the trgm score via
 * `corpusTrgmScore`), and the write side builds the embedding input with
 * `corpusText` in the same field order, so the two can never diverge.
 * Adding a corpus field (e.g. tags) is a deliberate single edit here.
 */
const corpusFields = [post.title, post.summary, sql`COALESCE(${postSearchIndex.plainText}, '')`]

/**
 * Verbatim-substring ILIKE disjuncts over the corpus — the whole result
 * set in like mode, and the recall floor for trgm and vector modes.
 */
export function corpusIlikeDisjuncts(query: string): SQL[] {
  return corpusFields.map((field) => ilikeEscape(field, query))
}

/**
 * Trigram score: the greatest word_similarity over the corpus.
 *
 * word_similarity(query, doc) — not plain similarity(): with a short
 * query inside a long plainText body, similarity() dilutes to
 * |shared| / |union| over the whole document (≈0.002 for a 5 000-char
 * body) and can never pass a useful threshold. word_similarity scores the
 * query against the best-matching extent of the document, so verbatim and
 * near-verbatim CJK/Latin matches score ≈0.4–1.0 regardless of body
 * length.
 */
export function corpusTrgmScore(query: string): SQL<number> {
  const scores = corpusFields.map((field) => sql`word_similarity(${query}, ${field})`)
  return sql<number>`greatest(${sql.join(scores, sql`, `)})`
}

/**
 * The corpus as plain text, in corpus-field order — the embedding input
 * on the write side (`posts/services/search-index.ts`).
 */
export function corpusText(input: { title: string; summary: string; plainText: string }): string {
  return `${input.title}\n${input.summary}\n${input.plainText}`.trim()
}
