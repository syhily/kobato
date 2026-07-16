import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { and, cosineDistance, desc, eq, gt, or, sql, type SQL } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import { ilikeEscape } from '@/server/infra/db/ilike-escape'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { storage } from '@/server/infra/redis/storage'
import { generateEmbedding } from '@/server/infra/search/openai'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { CACHE_BUCKET_FALLBACKS } from '@/shared/types/cache'

const DEFAULT_SEARCH_SETTINGS = {
  enabled: false,
  mode: 'like' as const,
  apiKey: '',
  model: 'text-embedding-3-small',
  similarityThreshold: 0.5,
  trgmThreshold: 0.3,
}

function getSearchSettings() {
  const bundle = getBlogSettingsBundleSync()
  return bundle?.search?.search ?? DEFAULT_SEARCH_SETTINGS
}

// pg_trgm availability probe
//
// The extension can only appear or disappear via a migration, and
// migrations run at boot — so the probe result is cached for the
// process lifetime. A failed probe (transient connection issue) is NOT
// cached: the next search retries.
let trgmAvailability: Promise<boolean> | null = null
let trgmFallbackWarned = false

function probeTrgmAvailability(db: NodePgDatabase): Promise<boolean> {
  trgmAvailability ??= db
    .execute(sql`SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`)
    .then((result) => result.rows.length > 0)
    .catch((error: unknown) => {
      trgmAvailability = null
      getLogger('search.trgm').error('pg_trgm availability probe failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    })
  return trgmAvailability
}

/**
 * Test-only seam: force the cached probe result (`true` / `false`) or
 * clear it (`null` → next search re-probes). Also re-arms the one-time
 * fallback warning so tests can observe it again.
 */
export function __setTrgmAvailabilityForTests(available: boolean | null): void {
  trgmAvailability = available === null ? null : Promise.resolve(available)
  trgmFallbackWarned = false
}

// Search-result cache
//
// The full ordered slug list for a query is cached so pagination never
// re-runs the embedding API or the database query.  The cache key
// incorporates every input that could change the result set:
//   - search mode (vector vs trgm vs like)
//   - query text
//   - similarity threshold (vector mode only)
//   - embedding model (vector mode only)
//   - trigram threshold (trgm mode only)
//
// Value is JSON.stringify(slugs[]) — short strings, negligible overhead.

function searchCacheKey(settings: ReturnType<typeof getSearchSettings>, query: string): string {
  const bundle = getBlogSettingsBundleSync()
  const prefix = bundle?.cache?.cache.searchResult?.prefix ?? CACHE_BUCKET_FALLBACKS.searchResult.prefix
  const hashInput = [settings.mode, query, String(settings.similarityThreshold)]
  if (settings.mode === 'vector') {
    hashInput.push(settings.model)
  }
  if (settings.mode === 'trgm') {
    hashInput.push(String(settings.trgmThreshold))
  }
  return `${prefix}${createHash('sha256').update(hashInput.join('|')).digest('hex')}`
}

async function getCachedSearchResult(key: string): Promise<string[] | null> {
  const raw = await storage.getItem(key)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === 'string')) {
        return parsed as string[]
      }
    } catch {
      // stale or corrupted — treat as miss
    }
  }
  return null
}

async function setCachedSearchResult(key: string, slugs: string[], ttlSeconds: number): Promise<void> {
  if (slugs.length === 0) {
    return
  }
  await storage.setItem(key, JSON.stringify(slugs), { ttl: ttlSeconds })
}

/**
 * Invalidate all cached search results. Called whenever a post's
 * published / deleted / restored state changes so stale result lists
 * don't survive until their TTL expires.
 */
export async function invalidateSearchCache(): Promise<void> {
  const bundle = getBlogSettingsBundleSync()
  const prefix = bundle?.cache?.cache.searchResult?.prefix ?? CACHE_BUCKET_FALLBACKS.searchResult.prefix
  const keys = await storage.getKeys(prefix, 1_000)
  if (keys.length === 0) {
    return
  }
  getLogger('search.cache').info('invalidating search result cache', { count: keys.length })
  await Promise.all(keys.map((k) => storage.removeItem(k)))
}

// Core search execution (no pagination — returns the full ordered list)

async function executeSearch(
  db: NodePgDatabase,
  settings: ReturnType<typeof getSearchSettings>,
  baseWhere: SQL,
  query: string,
): Promise<string[]> {
  const trimmed = query.trim()
  const likeWhere = and(
    baseWhere,
    or(
      ilikeEscape(post.title, trimmed),
      ilikeEscape(post.summary, trimmed),
      ilikeEscape(sql`COALESCE(${postSearchIndex.plainText}, '')`, trimmed),
    ),
  )

  // --- Trigram mode ---
  if (settings.mode === 'trgm') {
    if (await probeTrgmAvailability(db)) {
      // word_similarity(query, doc) — not plain similarity(): with a
      // short query inside a long plainText body, similarity() dilutes
      // to |shared| / |union| over the whole document (≈0.002 for a
      // 5 000-char body) and can never pass a useful threshold.
      // word_similarity scores the query against the best-matching
      // extent of the document, so verbatim and near-verbatim CJK/Latin
      // matches score ≈0.4–1.0 regardless of body length.
      //
      // The ILIKE disjuncts preserve LIKE-mode recall exactly (verbatim
      // substrings, 1–2-char queries that word_similarity can't trigram);
      // the threshold disjunct is what adds fuzzy matches on top. The
      // GIN index on plain_text accelerates the ILIKE side.
      const score = sql<number>`greatest(
        word_similarity(${trimmed}, ${post.title}),
        word_similarity(${trimmed}, ${post.summary}),
        word_similarity(${trimmed}, COALESCE(${postSearchIndex.plainText}, ''))
      )`

      const rows = await db
        .select({ slug: post.slug, score })
        .from(post)
        .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
        .where(
          and(
            baseWhere,
            or(
              gt(score, settings.trgmThreshold),
              ilikeEscape(post.title, trimmed),
              ilikeEscape(post.summary, trimmed),
              ilikeEscape(sql`COALESCE(${postSearchIndex.plainText}, '')`, trimmed),
            ),
          ),
        )
        .orderBy(desc(score), desc(post.publishedAt))

      getLogger('search.trgm').info('Search trigram results', {
        query: trimmed,
        rawRows: rows.length,
        threshold: settings.trgmThreshold,
        topScore: rows[0]?.score ?? null,
      })

      return rows.map((r) => r.slug)
    }

    // Extension missing (or probe failed) — degrade to LIKE, warn once.
    if (!trgmFallbackWarned) {
      trgmFallbackWarned = true
      getLogger('search.trgm').warn('pg_trgm extension unavailable — trgm search mode degrading to LIKE', {
        query: trimmed,
      })
    }
  }

  // --- Vector mode ---
  if (settings.enabled && settings.mode === 'vector') {
    const embedding = await generateEmbedding(trimmed)
    getLogger('search.vector').info('Search vector query', {
      query: trimmed,
      hasEmbedding: embedding !== null,
      dimensions: embedding?.length ?? 0,
      threshold: settings.similarityThreshold,
    })

    if (embedding !== null) {
      const similarity = sql<number>`1 - (${cosineDistance(postSearchIndex.embedding, embedding)})`

      const [vectorRows, likeRows] = await Promise.all([
        db
          .select({ slug: post.slug, similarity })
          .from(post)
          .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
          .where(and(baseWhere, gt(similarity, settings.similarityThreshold)))
          .orderBy(desc(similarity)),
        db
          .select({ slug: post.slug })
          .from(post)
          .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
          .where(likeWhere)
          .orderBy(desc(post.publishedAt)),
      ])

      getLogger('search.vector').info('Search vector results', {
        query: trimmed,
        rawRows: vectorRows.length,
        threshold: settings.similarityThreshold,
        topSimilarity: vectorRows[0]?.similarity ?? null,
      })

      getLogger('search.like').info('Search LIKE results', {
        query: trimmed,
        rawRows: likeRows.length,
      })

      // Merge: vector results first, then LIKE results deduplicated
      const seen = new Set<string>()
      const merged: string[] = []
      for (const row of vectorRows) {
        if (!seen.has(row.slug)) {
          seen.add(row.slug)
          merged.push(row.slug)
        }
      }
      for (const row of likeRows) {
        if (!seen.has(row.slug)) {
          seen.add(row.slug)
          merged.push(row.slug)
        }
      }
      return merged
    }
    // embedding generation failed → fall through to LIKE
  }

  // --- LIKE fallback ---
  const rows = await db
    .select({ slug: post.slug })
    .from(post)
    .leftJoin(postSearchIndex, eq(post.id, postSearchIndex.postId))
    .where(likeWhere)
    .orderBy(desc(post.publishedAt))

  getLogger('search.like').info('Search LIKE results', {
    query: trimmed,
    rawRows: rows.length,
  })

  return rows.map((r) => r.slug)
}

// Public API

// The visibility gate is supplied by the caller (infra has zero business
// knowledge — the "live" rule lives in `@/server/domains/content/schema`).
export async function searchPosts(
  db: NodePgDatabase,
  baseWhere: SQL,
  query: string,
  limit: number,
  offset: number = 0,
): Promise<{
  hits: string[]
  page: number
  totalPages: number
}> {
  const trimmed = query.trim()
  if (trimmed === '') {
    return { hits: [], page: 1, totalPages: 0 }
  }

  const settings = getSearchSettings()
  const cacheKey = searchCacheKey(settings, trimmed)

  // Try cache first
  const cached = await getCachedSearchResult(cacheKey)
  if (cached !== null) {
    getLogger('search.result').info('Search result cache hit', {
      query: trimmed,
      total: cached.length,
    })
    const hits = cached.slice(offset, offset + limit)
    return {
      hits,
      page: Math.floor(offset / limit) + 1,
      totalPages: Math.ceil(cached.length / Math.max(limit, 1)),
    }
  }

  // Execute full search
  const allSlugs = await executeSearch(db, settings, baseWhere, trimmed)

  // Write cache (only when non-empty, as requested)
  if (allSlugs.length > 0) {
    const bundle = getBlogSettingsBundleSync()
    const ttl = bundle?.cache?.cache.searchResult?.ttlSeconds ?? CACHE_BUCKET_FALLBACKS.searchResult.ttlSeconds
    await setCachedSearchResult(cacheKey, allSlugs, ttl)
  }

  const hits = allSlugs.slice(offset, offset + limit)
  return {
    hits,
    page: Math.floor(offset / limit) + 1,
    totalPages: Math.ceil(allSlugs.length / Math.max(limit, 1)),
  }
}
