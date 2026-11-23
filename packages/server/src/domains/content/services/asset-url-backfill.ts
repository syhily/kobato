import type { Database } from '@kobato/db/sqlite/database'
import type { LexicalEditorState } from '@kobato/inkling/headless/schema'

import { STORAGE_ROUTE_PREFIX } from '@kobato/assets/asset-url'
import {
  listContentBodies,
  listNonEmptyCoverRows,
  updateContentBody,
  updateEntityCover,
  type CoverOwnerEntity,
} from '@kobato/db/sqlite/operations/content/entity-asset'
import { findSettingByScope, upsertSetting } from '@kobato/db/sqlite/operations/system/setting'
import { SOLUTION_NODE_TYPE, TWO_COLUMN_NODE_TYPE } from '@kobato/inkling/headless/node-whitelist'
import { visitLexicalNodes } from '@kobato/inkling/headless/walk'
import { resolveSrcToStoragePath } from '@kobato/server/domains/images/services/resolve'
import { hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { computeBodyProjections } from '@kobato/server/infra/lexical/lexical-projection'
import { getLogger } from '@kobato/server/infra/logger'
import { getPublicBaseUrl, parseAssetUrl } from '@kobato/server/infra/storage/public-url'
import { isRecord } from '@kobato/utils/type-guards'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('content.asset-url-backfill')

const BOOT_FLAG_SCOPE = 'system.asset-url-backfill'

export interface AssetUrlBackfillResult {
  contentRows: number
  posts: number
  pages: number
  friends: number
  categories: number
  skippedContentRows: number
}

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

function siteOwnedSrc(storagePath: string): string {
  return `/storage/${storagePath.startsWith('/') ? storagePath.slice(1) : storagePath}`
}

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

function isLexicalBody(body: unknown): boolean {
  return isRecord(body) && isRecord(body.root) && Array.isArray(body.root.children)
}

async function persistRewrittenLexicalRow(db: Database, id: number, state: LexicalEditorState): Promise<void> {
  let projections: { bodyHtml: string; bodyText: string; bodyHtmlFeed: string } | null = null
  try {
    projections = await computeBodyProjections(state)
  } catch (error) {
    log.warn('Projection re-derivation failed; writing the rewritten body only', { id, error: String(error) })
  }
  await updateContentBody(db, id, { body: state, projections })
}

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

async function currentPublicBaseUrl(db: Database): Promise<string | null> {
  try {
    await hydrateBlogSettings(db)
    return getPublicBaseUrl()
  } catch {
    return null
  }
}

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

  const contentRows = await listContentBodies(db)
  for (const row of contentRows) {
    try {
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

  result.posts = await rewriteCoversFor(db, 'post', publicBaseUrl)
  result.pages = await rewriteCoversFor(db, 'page', publicBaseUrl)
  result.friends = await rewriteCoversFor(db, 'friend', publicBaseUrl)
  result.categories = await rewriteCoversFor(db, 'category', publicBaseUrl)
  return result
}

async function rewriteUrlRows(
  db: Database,
  entity: CoverOwnerEntity,
  rows: { id: number; url: string }[],
  publicBaseUrl: string | null,
): Promise<number> {
  let count = 0
  for (const row of rows) {
    const next = rewriteAssetReference(row.url, publicBaseUrl)
    if (next !== null) {
      await updateEntityCover(db, entity, row.id, next)
      count += 1
    }
  }
  return count
}

async function rewriteCoversFor(db: Database, entity: CoverOwnerEntity, publicBaseUrl: string | null): Promise<number> {
  return rewriteUrlRows(db, entity, await listNonEmptyCoverRows(db, entity), publicBaseUrl)
}

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
