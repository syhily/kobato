import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BundleKey } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  SETTINGS_SCOPE_PREFIX,
  SETTINGS_SECTIONS,
  sectionFromScope,
  type SettingsSection,
} from '@/server/domains/settings/sections'
import { decryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { storage } from '@/server/infra/redis/storage'
import { getBlogSettingsBundleSync, requireBlogSettingsBundle } from '@/shared/config/getters'
import { BUNDLE_KEYS } from '@/shared/config/sections'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import { deepFreeze } from '@/shared/utils/tools'

const log = getLogger('settings.snapshot')

const SETTINGS_VERSION_KEY = 'settings:snapshot:version'
let localSettingsVersion = 0

async function bumpSettingsVersion(): Promise<void> {
  const now = Date.now()
  await storage.setItem(SETTINGS_VERSION_KEY, now, { ttl: 60 * 60 * 24 * 7 })
}

async function getSettingsVersion(): Promise<number> {
  const value = await storage.getItem<number>(SETTINGS_VERSION_KEY)
  return value ?? 0
}

// Server-only writer for the in-process blog settings snapshot. Owns
// the DB read, the lazy hydration on first access, and the explicit
// refresh fired by every admin write.
//
// The synchronous reader `getBlogSettingsBundleSync()` lives in
// `@/shared/config/blog` so it can be reached from route `meta()`
// exports — which run on the client too — without dragging
// Drizzle/Postgres into the browser bundle. This module shares the
// same `BLOG_SETTINGS_SNAPSHOT_SLOT` so a single in-process snapshot
// is observable everywhere on the server.
//
// There is no longer a deep-merge with defaults: the codebase has no
// `DEFAULT_SETTINGS` anymore. Either the install flow has written the
// `blog.general` + `blog.assets` rows (and consumers see the matching
// buckets), or the install gate redirects every non-install request
// to `/admin/setup` before any consumer reaches for the
// snapshot. Pre-install we therefore expose `null`, and
// `requireBlogSettingsSection()` throws so any post-install path that
// bypasses the gate fails loudly.

// Dynamic key-value assembly for the settings bundle. The bundle is a
// strongly-typed `BlogSettingsBundle` but is assembled from DB rows whose
// section keys come from a registry. The cast is consolidated into these
// two helpers so the rest of the module uses typed access.
function bundleSet(bundle: BlogSettingsBundle, key: BundleKey, value: unknown): void {
  ;(bundle as unknown as Record<string, unknown>)[key] = value
}

function bundleHas(bundle: BlogSettingsBundle, key: BundleKey): boolean {
  return (bundle as unknown as Record<string, unknown>)[key] !== null
}

// Project the canonical `BUNDLE_KEYS` list (mirrors `SETTINGS_SECTIONS`)
// into a freshly-nulled bundle. Adding a section in
// `@/shared/config/settings.ts` automatically extends this — there is no
// sibling 12-line `null` literal to also remember.
function emptyBundle(): BlogSettingsBundle {
  return Object.fromEntries(BUNDLE_KEYS.map((key) => [key, null])) as unknown as BlogSettingsBundle
}

function decryptSecretsInBundle(bundle: BlogSettingsBundle): void {
  for (const { bundleKey, path, field } of SECRET_FIELDS) {
    const sectionData = bundle[bundleKey] as Record<string, unknown> | null
    if (sectionData === null) {
      continue
    }
    const bucket = sectionData[path] as Record<string, unknown> | undefined
    if (!bucket) {
      continue
    }
    const value = bucket[field]
    if (typeof value === 'string' && value.startsWith('enc:')) {
      bucket[field] = decryptIfNeeded(value)
    }
  }
}

async function loadSettingsFromDb(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
  // Intentionally NOT wrapped in a try/catch: DB errors must propagate
  // up to `hydrateBlogSettings()` so the failed promise can be evicted
  // from the cache. Otherwise a transient outage on the very first
  // hydration would permanently pin the snapshot at "uninstalled" and
  // deadlock every subsequent request behind the install redirect.
  const rows = await findSettingsByScopePrefix(db, SETTINGS_SCOPE_PREFIX)
  if (rows.length === 0) {
    return null
  }

  const bundle = emptyBundle()
  for (const row of rows) {
    const section = sectionFromScope(row.scope)
    if (section === null) {
      log.warn('Ignoring setting row with unrecognised scope', { scope: row.scope })
      continue
    }
    const data = row.data
    if (data === null || typeof data !== 'object') {
      log.warn('Setting row has non-object data; skipping', { scope: row.scope })
      continue
    }
    const meta = SECTION_REGISTRY[section]
    if (!meta.schema.safeParse(data).success) {
      log.warn('Setting row failed schema validation; skipping', { scope: row.scope })
      continue
    }
    // The bucket field carries the same DTO shape as the row's `data`;
    // the cast is a deliberate boundary widening that the schema
    // validation above backs.
    bundleSet(bundle, meta.key, data)
  }

  // (`blog.general` + `blog.assets`) must be present. Until they are,
  // treat the deployment as uninstalled so the install gate keeps
  // redirecting to `/admin/setup`.
  if (bundle.siteIdentity === null || bundle.assets === null) {
    return null
  }

  // Backfill: a deployment installed BEFORE the "seed every section at
  // install" change exists in the wild with only the 2 install rows.
  // The strict per-section hooks (`useFooterSettings()`, …) would
  // throw on the very first public render. Detect missing optional
  // sections here, write the registry's default payload for each, and
  // fold the freshly-seeded data into the bundle so the SAME hydration
  // call returns a complete snapshot. New installs run through
  // `signUpInitialAdminWithSession()` which writes all rows up
  // front, so they hit this branch with nothing to do.
  await backfillMissingSectionDefaults(bundle, db)

  // Decrypt any encrypted secret fields so runtime consumers see plaintext.
  decryptSecretsInBundle(bundle)

  return bundle
}

/**
 * Detect sections whose `defaults` is non-null but whose bundle
 * bucket is still `null` (i.e. the install pre-dates the "seed all
 * sections at install" change). For each such section, validate the
 * registry default, write it to the matching `setting('blog.<scope>')`
 * row, and populate the bucket so the caller observes the same
 * post-backfill snapshot the next request would.
 *
 * Mutates `bundle` in place. Logs and skips sections whose seed
 * default fails its own schema (programmer error in `sections.ts`)
 * or whose UPSERT fails (transient DB error — the next hydration
 * tick will retry). Crucially we DO NOT throw: a backfill failure
 * would otherwise propagate to `hydrateBlogSettings()` and deadlock
 * the entire site behind the install gate. The user-visible cost of a
 * skipped backfill is the original "no provider in scope" error on
 * the missing section, which is what we had before this change — no
 * regression.
 */
async function backfillMissingSectionDefaults(bundle: BlogSettingsBundle, db: NodePgDatabase): Promise<void> {
  let candidates: { section: SettingsSection; payload: Record<string, unknown> }[]
  try {
    candidates = buildDefaultSectionPayloads()
  } catch (error) {
    log.error('Section defaults invalid; skipping backfill', { error })
    return
  }

  for (const { section, payload } of candidates) {
    const meta = SECTION_REGISTRY[section]
    // Skip sections whose row already exists. The bundle.<key> field
    // is `null` only when the SELECT above either didn't see a row or
    // saw one whose probe rejected the shape; both are safe to
    // overwrite with the validated default (probe-failed rows are
    // already being treated as missing by the snapshot reader).
    if (bundleHas(bundle, meta.key)) {
      continue
    }

    try {
      await upsertSetting(db, payload, null, meta.scope)
      bundleSet(bundle, meta.key, payload)
      log.info('Backfilled missing section with registry default', { scope: meta.scope })
    } catch (error) {
      log.warn('Failed to backfill missing section default', { scope: meta.scope, error })
    }
  }
}

/**
 * Eagerly hydrate the settings snapshot. Safe to call multiple times —
 * concurrent callers share the same in-flight promise. Resolves to the
 * stored `BlogSettingsBundle` (or `null` when the deployment has not
 * been installed yet).
 *
 * If the underlying DB query throws (transient outage, pool drain, …)
 * the cached promise is cleared so the next caller can retry instead of
 * being permanently pinned at the failure.
 */
export async function hydrateBlogSettings(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
  const pending = BLOG_SETTINGS_SNAPSHOT_SLOT.readHydration()
  if (pending) {
    const cached = BLOG_SETTINGS_SNAPSHOT_SLOT.read()
    if (cached === null) {
      return pending
    }
    const sharedVersion = await getSettingsVersion()
    if (sharedVersion <= localSettingsVersion) {
      return pending
    }
  }

  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  const targetVersion = await getSettingsVersion()
  const newPending = (async () => {
    try {
      const value = await loadSettingsFromDb(db)
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(value)
      localSettingsVersion = targetVersion
      return value
    } catch (error) {
      // Evict the failed promise so a follow-up request retries.
      // We rethrow so the caller can decide what to do (the install
      // gate logs and lets the request through; the search warmup
      // logs and skips index construction).
      BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
      throw error
    }
  })()
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(newPending)
  return newPending
}

/**
 * Force a re-read from the DB (used by the install + admin write
 * endpoints after a successful update so the next request sees the new
 * values without waiting for a cache window to expire).
 */
export async function refreshBlogSettings(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  await bumpSettingsVersion()
  const result = await hydrateBlogSettings(db)
  return result
}

// Re-export the synchronous readers from the shared module so existing
// server-side callers (`@/server/render/seo/meta`, settings service, …) can
// keep importing from `@/server/domains/settings/snapshot` without caring that
// the actual implementation lives in `@/shared/`.
export { getBlogSettingsBundleSync, requireBlogSettingsBundle }

// Kick off the initial hydration as soon as this module is first imported
// from a server bundle. The first request that lands before the promise
// resolves will see `null` from the synchronous reader — the install
// gate runs before any consumer reaches for the snapshot, so that case
// only happens during the install flow itself (which tolerates `null`).
//
// Test runs (`VITEST=true`) skip the hydration so the suite isn't forced
// to mock the DB pool just to import a server module. Tests that need a
// hydrated snapshot can call `setBlogSettingsBundleForTests(...)`.
export function warmBlogSettingsSnapshot(db: NodePgDatabase): void {
  void hydrateBlogSettings(db).catch((error) => {
    log.error('Blog settings hydration failed', { error })
  })
}

/** Test-only: replace the snapshot synchronously. */
export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  const frozen = value == null ? value : deepFreeze(value)
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(frozen)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(frozen === undefined ? undefined : Promise.resolve(frozen ?? null))
}

// `SETTINGS_SECTIONS` is exported for `service.ts` and tests that
// need to enumerate the registry.
export { SETTINGS_SECTIONS }
