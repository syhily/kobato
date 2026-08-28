import { eq, ne } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { PortableTextBody } from '@/shared/pt/schema'

import { resolveSrcToStoragePath } from '@/server/domains/images/services/cache'
import { hydrateBlogSettings } from '@/server/domains/settings/services/hydrate'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { content } from '@/server/infra/db/schema/content'
import { friend } from '@/server/infra/db/schema/friend'
import { page } from '@/server/infra/db/schema/page'
import { post } from '@/server/infra/db/schema/post'
import { category } from '@/server/infra/db/schema/taxonomy'
import { getLogger } from '@/server/infra/logger'
import { getPublicBaseUrl, parseAssetUrl } from '@/server/infra/storage/public-url'
import { visitNestedBlocks } from '@/shared/pt/utils'
import { STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * One-time rewrite of legacy baked asset URLs to the site-owned
 * origin-relative form (`/storage/<key>`). Storage backends, buckets and CDN
 * hosts change over a site's lifetime; content must never carry those
 * absolutes. Runs once at boot (flag-gated on a `setting` row) and again —
 * unconditionally but idempotently — after every completed storage migration.
 * Failure-swallowing at both call sites: a failed backfill never blocks boot
 * or a migration, and the boot flag is only written on success (retry next boot).
 */

const log = getLogger('content.asset-url-backfill')

/** Durable one-shot flag: a `system.`-scoped `setting` row (hydration reads `blog.*` only). */
const BOOT_FLAG_SCOPE = 'system.asset-url-backfill'

export interface AssetUrlBackfillResult {
  contentRows: number
  posts: number
  pages: number
  friends: number
  categories: number
}

/**
 * Resolve a stored reference to its storage key when it is provably ours.
 * The site-owned core is `parseAssetUrl` (origin-relative plus any-origin
 * absolute forms — domain moves); the legacy CDN-absolute width (any key
 * prefix, `!` transform suffixes) and the bare `storage/<key>` form stay
 * layered on top via the images matcher. The bare `/images/…` form
 * `resolveSrcToStoragePath` also accepts is deliberately NOT rewritten here —
 * it collides with first-party site routes (`/images/og/…`,
 * `/images/calendar/…`), which must stay untouched.
 */
function rewritableStoragePath(src: string, publicBaseUrl: string | null): string | null {
  if (publicBaseUrl !== null && src.startsWith(`${publicBaseUrl}/`)) {
    return nonEmpty(resolveSrcToStoragePath(src, publicBaseUrl))
  }
  if (src.startsWith('/images/') || src.startsWith('images/')) {
    return null
  }
  if (src.startsWith('http://') || src.startsWith('https://')) {
    try {
      if (new URL(src).pathname.startsWith('/images/')) {
        return null
      }
    } catch {
      return null
    }
  }
  if (src.startsWith('storage/')) {
    return nonEmpty(resolveSrcToStoragePath(src, null))
  }
  const parsed = parseAssetUrl(src, { anyOrigin: true })
  if (parsed === null || parsed.route !== STORAGE_ROUTE_PREFIX) {
    return null
  }
  return nonEmpty(parsed.key)
}

function nonEmpty(path: string | null): string | null {
  return path === null || path === '' ? null : path
}

/** `/storage/<key>` rewrite target for a resolved storage path. */
function siteOwnedSrc(storagePath: string): string {
  return `/storage/${storagePath.startsWith('/') ? storagePath.slice(1) : storagePath}`
}

/**
 * Rewrite every image block in a PT body in place: blocks carrying a
 * `storagePath` re-stamp unconditionally (the old host is irrelevant);
 * blocks without one rewrite only when `src` provably resolves to our
 * storage. Truly external images are left alone.
 */
export function rewriteBodyAssetUrls(
  body: PortableTextBody,
  publicBaseUrl: string | null,
): { body: PortableTextBody; changed: boolean } {
  let changed = false
  visitNestedBlocks(body, (block) => {
    if (block._type !== 'image') {
      return
    }
    const storagePath =
      typeof block.storagePath === 'string' && block.storagePath !== ''
        ? block.storagePath
        : rewritableStoragePath(block.src, publicBaseUrl)
    if (storagePath === null) {
      return
    }
    const next = siteOwnedSrc(storagePath)
    if (block.src !== next) {
      block.src = next
      changed = true
    }
  })
  return { body, changed }
}

/** Rewrite one stored cover/poster URL; `null` when unchanged or not ours. */
export function rewriteAssetReference(url: string, publicBaseUrl: string | null): string | null {
  if (url === '') {
    return null
  }
  const storagePath = rewritableStoragePath(url, publicBaseUrl)
  if (storagePath === null) {
    return null
  }
  const next = siteOwnedSrc(storagePath)
  return url === next ? null : next
}

/** The CURRENT CDN base; `null` pre-install / unhydrated (the `/storage/` forms still rewrite). */
async function currentPublicBaseUrl(db: Database): Promise<string | null> {
  try {
    await hydrateBlogSettings(db)
    return getPublicBaseUrl()
  } catch {
    return null
  }
}

/**
 * The rewrite engine. Idempotent: rewritten values resolve to themselves, so
 * a second run updates zero rows. A malformed row logs and skips — the rest
 * of the corpus still backfills.
 */
export async function backfillStorageAssetUrls(db: Database): Promise<AssetUrlBackfillResult> {
  const publicBaseUrl = await currentPublicBaseUrl(db)
  const result: AssetUrlBackfillResult = { contentRows: 0, posts: 0, pages: 0, friends: 0, categories: 0 }

  const contentRows = await db.select({ id: content.id, body: content.body }).from(content)
  for (const row of contentRows) {
    try {
      const { body, changed } = rewriteBodyAssetUrls(unsafeCast<PortableTextBody>(row.body), publicBaseUrl)
      if (changed) {
        await db.update(content).set({ body }).where(eq(content.id, row.id))
        result.contentRows += 1
      }
    } catch (error) {
      log.warn('Skipping content row with unrewritable body', { id: row.id, error: String(error) })
    }
  }

  result.posts = await rewritePostCovers(db, publicBaseUrl)
  result.pages = await rewritePageCovers(db, publicBaseUrl)
  result.friends = await rewriteFriendPosters(db, publicBaseUrl)
  result.categories = await rewriteCategoryCovers(db, publicBaseUrl)
  return result
}

// The four cover/poster columns share one rewrite loop; each caller keeps
// its concretely-typed drizzle write.

async function rewriteUrlRows(
  rows: { id: number; url: string }[],
  publicBaseUrl: string | null,
  write: (id: number, next: string) => Promise<unknown>,
): Promise<number> {
  let count = 0
  for (const row of rows) {
    const next = rewriteAssetReference(row.url, publicBaseUrl)
    if (next !== null) {
      await write(row.id, next)
      count += 1
    }
  }
  return count
}

async function rewritePostCovers(db: Database, publicBaseUrl: string | null): Promise<number> {
  return rewriteUrlRows(
    await db.select({ id: post.id, url: post.cover }).from(post).where(ne(post.cover, '')),
    publicBaseUrl,
    (id, next) => db.update(post).set({ cover: next }).where(eq(post.id, id)),
  )
}

async function rewritePageCovers(db: Database, publicBaseUrl: string | null): Promise<number> {
  return rewriteUrlRows(
    await db.select({ id: page.id, url: page.cover }).from(page).where(ne(page.cover, '')),
    publicBaseUrl,
    (id, next) => db.update(page).set({ cover: next }).where(eq(page.id, id)),
  )
}

async function rewriteFriendPosters(db: Database, publicBaseUrl: string | null): Promise<number> {
  return rewriteUrlRows(
    await db.select({ id: friend.id, url: friend.poster }).from(friend).where(ne(friend.poster, '')),
    publicBaseUrl,
    (id, next) => db.update(friend).set({ poster: next }).where(eq(friend.id, id)),
  )
}

async function rewriteCategoryCovers(db: Database, publicBaseUrl: string | null): Promise<number> {
  return rewriteUrlRows(
    await db.select({ id: category.id, url: category.cover }).from(category).where(ne(category.cover, '')),
    publicBaseUrl,
    (id, next) => db.update(category).set({ cover: next }).where(eq(category.id, id)),
  )
}

/**
 * Flag-gated boot entry point: runs the backfill once per database, persists
 * the flag only on success, and swallows failures (logged; retried next boot).
 */
export async function runAssetUrlBackfillOnceAtBoot(db: Database): Promise<void> {
  try {
    if (findSettingByScope(db, BOOT_FLAG_SCOPE) !== null) {
      return
    }
    const result = await backfillStorageAssetUrls(db)
    upsertSetting(db, { completedAt: new Date().toISOString(), ...result }, null, BOOT_FLAG_SCOPE)
    log.info('Storage asset URL backfill completed', { ...result })
  } catch (error) {
    log.warn('Storage asset URL backfill failed; will retry on next boot', { error: String(error) })
  }
}
