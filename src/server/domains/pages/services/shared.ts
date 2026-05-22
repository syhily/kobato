import type { AdminRevisionDto, CmsPage } from '@/server/domains/pages/projection'
import type { SaveDraftResult, PublishLatestResult } from '@/server/domains/pages/repo'

import { toAdminRevisionDto } from '@/server/domains/pages/projection'
import { createRedisCache } from '@/server/infra/cache/redis-cache'
import { DomainError } from '@/server/infra/http/errors'
import { deriveSlug } from '@/server/infra/slug'

// Visibility gate shared by the listing and single-page lookups.
// A page is considered live publicly iff:
export const pagesCache = createRedisCache<CmsPage[]>('pages:catalog', { ttlMs: 10_000 })

export async function clearPagesCache(): Promise<void> {
  await pagesCache.clear()
}

export interface UpsertPageMetaInput {
  /** Existing page id; omitted on create. */
  id?: bigint
  /**
   * Explicit URL slug. Optional — when omitted (or empty), the
   * service derives one from `title` via `deriveSlug` (the canonical
   * pinyin -> github-slugger pipeline). Authors only set this when
   * they want a custom URL like `about-us` for a Han-titled page.
   */
  slug?: string
  title: string
  summary?: string
  cover?: string
  og?: string | null
  published?: boolean
  commentsEnabled?: boolean
  showToc?: boolean
  showUpdated?: boolean
  showFriends?: boolean
  publishedAt?: Date
}

export const RESERVED_PAGE_SLUGS = new Set<string>([
  // Route-prefix fence only. page↔post slug uniqueness is enforced by
  // `validateSlugFence` at every catalog snapshot rebuild.
  'posts',
  'cats',
  'tags',
  'archives',
  'search',
  'admin',
  'api',
  'feed',
  'sitemap.xml',
  'robots.txt',
])

export const SLUG_PATTERN = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export function ensureSlugLegal(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new DomainError('BAD_REQUEST', '页面 slug 格式不合法（仅允许小写字母、数字、`-` `_` `.`）。')
  }
  if (slug.length > 80) {
    throw new DomainError('BAD_REQUEST', '页面 slug 长度不得超过 80 个字符。')
  }
  if (RESERVED_PAGE_SLUGS.has(slug)) {
    throw new DomainError('BAD_REQUEST', `slug "${slug}" 是站点保留路径。`)
  }
}

// Resolve the effective slug. An explicit non-empty value wins; an
// empty / missing value falls back to `deriveSlug(title)`. Pages that
// can't produce a slug from their title (e.g. emoji-only titles) get
// a friendly 400 instead of falling through to the regex check with
// the empty string.
export function resolveSlugForPage(explicit: string | undefined, title: string): string {
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return explicit.trim()
  }
  const derived = deriveSlug(title)
  if (derived === '') {
    throw new DomainError('BAD_REQUEST', '无法从标题推导出 slug，请手动填写。', [
      { message: '标题推导出空 slug，请手动填写', path: ['slug'] },
    ])
  }
  return derived
}

export interface SavePageBodyInput {
  pageId: bigint
  body: unknown
  /** When provided, must match the latest revision's token. */
  expectedClientRevisionToken?: string | null
  /** When true, ignore token mismatch and overwrite. */
  force?: boolean
  /** Author user id stamped on the saved revision. */
  authorId: bigint | null
  /**
   * Publish target (only honoured by `publishLatest`). Omit for
   * "publish immediately" (server uses `now()`); pass a future
   * `Date` to schedule. The catalog hides scheduled pages until
   * `publishedAt <= now()`.
   */
  publishedAt?: Date
}

export type SavePageResult =
  | { status: 'saved'; revision: AdminRevisionDto }
  | {
      status: 'conflict'
      latest: AdminRevisionDto
      /** Token the editor must echo on the next attempt. */
      expectedToken: string
    }

export function projectSaveResult(result: SaveDraftResult | PublishLatestResult): SavePageResult {
  if (result.status === 'conflict') {
    return {
      status: 'conflict',
      latest: toAdminRevisionDto(result.latest),
      expectedToken: result.expectedToken,
    }
  }
  return { status: 'saved', revision: toAdminRevisionDto(result.row) }
}

export type { AdminPageDetailDto, AdminPageDto } from '@/server/domains/pages/projection'
