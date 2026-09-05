import { eq, ne } from 'drizzle-orm'

import type { Database } from '@/server/infra/db/database'
import type { LexicalEditorState } from '@/shared/lexical/schema'
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
import { computeBodyProjections } from '@/server/infra/pt/lexical-projection'
import { getPublicBaseUrl, parseAssetUrl } from '@/server/infra/storage/public-url'
import { SOLUTION_NODE_TYPE, TWO_COLUMN_NODE_TYPE } from '@/shared/lexical/node-whitelist'
import { visitLexicalNodes } from '@/shared/lexical/walk'
import { visitNestedBlocks } from '@/shared/pt/utils'
import { STORAGE_ROUTE_PREFIX } from '@/shared/types/asset-url'
import { isRecord } from '@/shared/utils/type-guards'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/**
 * One-time rewrite of legacy baked asset URLs to the site-owned
 * origin-relative form (`/storage/<key>`). Storage backends, buckets and CDN
 * hosts change over a site's lifetime; content must never carry those
 * absolutes. Content bodies dispatch per row on the storage format: legacy
 * PortableText arrays walk `visitNestedBlocks`; canonical Lexical states walk
 * `visitLexicalNodes` (image nodes, plus the nested-editor HTML datasets of
 * the solution / two-column / footnotedefinition host cards whose images are
 * `<img>` markup, not nodes) and re-derive the three projection columns so
 * the read path drops the old host too. Runs once at boot (flag-gated on a
 * `setting` row) and again — unconditionally but idempotently — after every
 * completed storage migration. Failure-swallowing at both call sites: a
 * failed backfill never blocks boot or a migration, and the boot flag is
 * only written when the run finishes with zero skipped rows (a partial run
 * retries next boot).
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
  /** Content rows left untouched: body parses as neither PT nor Lexical, or the row threw. */
  skippedContentRows: number
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
 * storage. Truly external images are left alone. This is the LEGACY path —
 * the boot PT→Lexical backfill converts the row right after and derives its
 * projections then, so changed PT rows get no projection work here.
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

/**
 * Host-card dataset keys carrying nested-editor HTML: images inside them are
 * `<img>` markup, not nodes (the R15 conversion rendered PT nested blocks to
 * HTML through the projection renderer). `footnotedefinition` joins solution
 * / two-column — its dataset `content` is the same kind of nested HTML.
 * music-player carries no images and stays absent. The exportDOM markup
 * deliberately emits no `data-storage-path` (storage internals never enter
 * HTML), so the HTML datasets rewrite through the src predicate alone.
 */
const NESTED_HTML_DATASET_KEYS: Record<string, readonly string[]> = {
  [SOLUTION_NODE_TYPE]: ['content'],
  [TWO_COLUMN_NODE_TYPE]: ['left', 'right'],
  footnotedefinition: ['content'],
}

const HTML_ATTR_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
}

function unescapeHtmlAttribute(value: string): string {
  return value.replace(/&([a-zA-Z#0-9]+);/g, (match, entity: string) => HTML_ATTR_ENTITIES[entity] ?? match)
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/**
 * Rewrite every double-quoted `<img src="…">` in a card-dataset HTML string
 * through `rewrite` (null = leave untouched). Regex-based like
 * `htmlToPlainText` — the datasets come from our own exportDOM renderers,
 * which always emit double-quoted srcs. srcset is deliberately NOT rewritten:
 * its candidates are render-time transform URLs (regenerated from `src` by
 * the projection), not stored references.
 */
function rewriteHtmlImgSrcs(html: string, rewrite: (src: string) => string | null): { html: string; changed: boolean } {
  let changed = false
  const next = html.replace(
    /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi,
    (match, prefix: string, rawSrc: string, suffix: string) => {
      const rewritten = rewrite(unescapeHtmlAttribute(rawSrc))
      if (rewritten === null) {
        return match
      }
      changed = true
      return `${prefix}${escapeHtmlAttribute(rewritten)}${suffix}`
    },
  )
  return { html: next, changed }
}

/**
 * The Lexical twin of `rewriteBodyAssetUrls` — same semantics on the
 * canonical format: image nodes carrying a non-empty `storagePath` re-stamp
 * `src` unconditionally; the rest rewrite only when the src provably resolves
 * to our storage; truly external images stay untouched. Nested host-card HTML
 * (solution content, two-column panes, footnotedefinition content) rewrites
 * its `<img>` srcs through the same predicate. Mutates in place.
 */
export function rewriteLexicalBodyAssetUrls(
  state: LexicalEditorState,
  publicBaseUrl: string | null,
): { state: LexicalEditorState; changed: boolean } {
  let changed = false
  visitLexicalNodes(state, (node) => {
    if (node.type === 'image') {
      const record = unsafeCast<Record<string, unknown>>(node)
      if (typeof record.src !== 'string') {
        return
      }
      const storagePath =
        typeof record.storagePath === 'string' && record.storagePath !== ''
          ? record.storagePath
          : rewritableStoragePath(record.src, publicBaseUrl)
      if (storagePath === null) {
        return
      }
      const next = siteOwnedSrc(storagePath)
      if (record.src !== next) {
        record.src = next
        changed = true
      }
      return
    }
    const datasetKeys = NESTED_HTML_DATASET_KEYS[node.type]
    if (datasetKeys === undefined) {
      return
    }
    const record = unsafeCast<Record<string, unknown>>(node)
    for (const key of datasetKeys) {
      const html = record[key]
      if (typeof html !== 'string' || html === '') {
        continue
      }
      const rewritten = rewriteHtmlImgSrcs(html, (src) => rewriteAssetReference(src, publicBaseUrl))
      if (rewritten.changed) {
        record[key] = rewritten.html
        changed = true
      }
    }
  })
  return { state, changed }
}

/** A canonical Lexical editor state is an object with a `root.children` array. */
function isLexicalBody(body: unknown): boolean {
  return isRecord(body) && isRecord(body.root) && Array.isArray(body.root.children)
}

/**
 * Writes a rewritten Lexical body and re-derives the three projection
 * columns through the same machinery the R15 executor uses
 * (`computeBodyProjections`) — without it `body_html` keeps embedding the old
 * baked URLs and the backfill is pointless on the read path. The derivation
 * is best-effort (the save-pipeline convention): a failure writes the body
 * alone and leaves the stale columns in place with a warning.
 */
async function persistRewrittenLexicalRow(db: Database, id: number, state: LexicalEditorState): Promise<void> {
  let projections: { bodyHtml: string; bodyText: string; bodyHtmlFeed: string } | null = null
  try {
    projections = await computeBodyProjections(state)
  } catch (error) {
    log.warn('Projection re-derivation failed; writing the rewritten body only', { id, error: String(error) })
  }
  await db
    .update(content)
    .set(
      projections === null
        ? { body: state }
        : {
            body: state,
            bodyHtml: projections.bodyHtml,
            bodyText: projections.bodyText,
            bodyHtmlFeed: projections.bodyHtmlFeed,
          },
    )
    .where(eq(content.id, id))
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
 * a second run updates zero rows. Bodies dispatch per row on the storage
 * format (PT array / Lexical state); a row that is neither — or that throws —
 * logs, counts as skipped, and the rest of the corpus still backfills.
 */
export async function backfillStorageAssetUrls(db: Database): Promise<AssetUrlBackfillResult> {
  const publicBaseUrl = await currentPublicBaseUrl(db)
  const result: AssetUrlBackfillResult = {
    contentRows: 0,
    posts: 0,
    pages: 0,
    friends: 0,
    categories: 0,
    skippedContentRows: 0,
  }

  const contentRows = await db.select({ id: content.id, body: content.body }).from(content)
  for (const row of contentRows) {
    try {
      if (Array.isArray(row.body)) {
        const { body, changed } = rewriteBodyAssetUrls(unsafeCast<PortableTextBody>(row.body), publicBaseUrl)
        if (changed) {
          await db.update(content).set({ body }).where(eq(content.id, row.id))
          result.contentRows += 1
        }
        continue
      }
      if (isLexicalBody(row.body)) {
        const { state, changed } = rewriteLexicalBodyAssetUrls(unsafeCast<LexicalEditorState>(row.body), publicBaseUrl)
        if (changed) {
          await persistRewrittenLexicalRow(db, row.id, state)
          result.contentRows += 1
        }
        continue
      }
      result.skippedContentRows += 1
      log.warn('Skipping content row with unrecognized body shape', { id: row.id })
    } catch (error) {
      result.skippedContentRows += 1
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
 * the flag only when the run finishes with ZERO skipped rows (a partial run
 * is not a success — the flag stays unwritten and the next boot retries),
 * and swallows failures (logged; retried next boot).
 */
export async function runAssetUrlBackfillOnceAtBoot(db: Database): Promise<void> {
  try {
    if (findSettingByScope(db, BOOT_FLAG_SCOPE) !== null) {
      return
    }
    const result = await backfillStorageAssetUrls(db)
    if (result.skippedContentRows > 0) {
      log.warn('Storage asset URL backfill skipped rows; flag withheld, retrying next boot', { ...result })
      return
    }
    upsertSetting(db, { completedAt: new Date().toISOString(), ...result }, null, BOOT_FLAG_SCOPE)
    log.info('Storage asset URL backfill completed', { ...result })
  } catch (error) {
    log.warn('Storage asset URL backfill failed; will retry on next boot', { error: String(error) })
  }
}
