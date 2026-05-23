import { and, cosineDistance, desc, eq, gt, ilike, isNull, or, sql } from 'drizzle-orm'
import { createHash } from 'node:crypto'

import { db } from '@/server/infra/db/pool'
import { postSearchIndex } from '@/server/infra/db/schema/content'
import { post } from '@/server/infra/db/schema/post'
import { getLogger } from '@/server/infra/logger'
import { storage } from '@/server/infra/redis/storage'
import { generateEmbedding } from '@/server/infra/search/openai'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'
import { CACHE_BUCKET_FALLBACKS } from '@/shared/types/cache'

const DEFAULT_SEARCH_SETTINGS = {
  enabled: false,
  mode: 'like' as const,
  apiKey: '',
  model: 'text-embedding-3-small',
  similarityThreshold: 0.5,
}

function getSearchSettings() {
  const bundle = getBlogSettingsBundleSync()
  return bundle?.search?.search ?? DEFAULT_SEARCH_SETTINGS
}

// ---------------------------------------------------------------------------
// Search-result cache
//
// The full ordered slug list for a query is cached so pagination never
// re-runs the embedding API or the database query.  The cache key
// incorporates every input that could change the result set:
//   - search mode (vector vs like)
//   - query text
//   - similarity threshold (vector mode only)
//   - embedding model (vector mode only)
//
// Value is JSON.stringify(slugs[]) — short strings, negligible overhead.
// ---------------------------------------------------------------------------

function searchCacheKey(settings: ReturnType<typeof getSearchSettings>, query: string): string {
  const bundle = getBlogSettingsBundleSync()
  const prefix = bundle?.cache?.cache.searchResult?.prefix ?? CACHE_BUCKET_FALLBACKS.searchResult.prefix
  const hashInput = [settings.mode, query, String(settings.similarityThreshold)]
  if (settings.mode === 'vector') {
    hashInput.push(settings.model)
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

// ---------------------------------------------------------------------------
// Core search execution (no pagination — returns the full ordered list)
// ---------------------------------------------------------------------------

async function executeSearch(settings: ReturnType<typeof getSearchSettings>, query: string): Promise<string[]> {
  const trimmed = query.trim()
  const pattern = `%${trimmed.replace(/[%_]/g, '\\$&')}%`
  const baseWhere = and(isNull(post.deletedAt), eq(post.published, true))
  const likeWhere = and(
    baseWhere,
    or(
      ilike(post.title, pattern),
      ilike(post.summary, pattern),
      ilike(sql`COALESCE(${postSearchIndex.plainText}, '')`, pattern),
    ),
  )

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function searchPosts(
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
  const allSlugs = await executeSearch(settings, trimmed)

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
