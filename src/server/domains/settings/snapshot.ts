import type { BlogSettingsBundle } from '@/shared/config/blog'

type BundleWithIndex = BlogSettingsBundle & Record<string, unknown>

import { RATE_LIMIT_BUCKET_KEYS } from '@/server/domains/settings/schemas/rate-limit'
import {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  SETTINGS_SCOPE_PREFIX,
  SETTINGS_SECTIONS,
  sectionFromScope,
  type SettingsSection,
} from '@/server/domains/settings/sections'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { storage } from '@/server/infra/redis/storage'
import { BLOG_SETTINGS_SNAPSHOT_SLOT, getBlogSettingsBundleSync, requireBlogSettingsBundle } from '@/shared/config/blog'
import { BUNDLE_KEYS } from '@/shared/config/settings'
import { CACHE_BUCKET_IDS } from '@/shared/types/cache'

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

// Per-section shape probes. Each probe returns `true` when the loaded
// JSONB row matches the bucket DTO it claims to populate; rows that
// fail the probe are silently dropped so a corrupt section can't take
// down sibling sections that loaded fine.
//
// Keys are typed as `SettingsSection` so adding a new section in
// `SETTINGS_SECTIONS` makes the compiler insist on a matching probe
// here — the only per-section asymmetry that did NOT collapse into
// the `SECTION_REGISTRY` derivation below.
type SectionProbe = (value: Record<string, unknown>) => boolean

const PROBES: Record<SettingsSection, SectionProbe> = {
  general: (value) =>
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.website === 'string' &&
    Array.isArray(value.keywords) &&
    typeof value.author === 'object' &&
    value.author !== null &&
    typeof value.locale === 'string' &&
    typeof value.timeZone === 'string' &&
    typeof value.timeFormat === 'string',
  // The merged `assets` section combines the music CDN host (formerly
  // `localization.asset`), the S3 storage credentials, and the upload
  // limits. Rows persisted before the merge carry only some of these
  // and would otherwise pass an over-permissive probe — only to crash
  // callers that read every field. The probe enforces the full
  // post-merge shape so legacy rows fall through and are caught by
  // the `siteIdentity === null || assets === null` "uninstalled" gate
  assets: (value) => {
    if (typeof value.asset !== 'object' || value.asset === null) {
      return false
    }
    if (typeof value.storage !== 'object' || value.storage === null) {
      return false
    }
    if (typeof value.upload !== 'object' || value.upload === null) {
      return false
    }
    const asset = value.asset as Record<string, unknown>
    const storage = value.storage as Record<string, unknown>
    const upload = value.upload as Record<string, unknown>
    return (
      typeof asset.host === 'string' &&
      (asset.scheme === 'http' || asset.scheme === 'https') &&
      typeof storage.enabled === 'boolean' &&
      typeof storage.endpoint === 'string' &&
      typeof storage.region === 'string' &&
      typeof storage.bucket === 'string' &&
      typeof storage.accessKeyId === 'string' &&
      typeof storage.secretAccessKey === 'string' &&
      typeof storage.forcePathStyle === 'boolean' &&
      typeof storage.urlTemplate === 'string' &&
      typeof upload.maxBytes === 'number' &&
      typeof upload.jpegQuality === 'number'
    )
  },
  navigation: (value) =>
    typeof value.navigation === 'object' &&
    value.navigation !== null &&
    Array.isArray((value.navigation as Record<string, unknown>).sideNav) &&
    Array.isArray((value.navigation as Record<string, unknown>).footerNav),
  socials: (value) => Array.isArray(value.socials),
  content: (value) =>
    typeof value.pagination === 'object' &&
    value.pagination !== null &&
    typeof value.feed === 'object' &&
    value.feed !== null &&
    typeof value.post === 'object' &&
    value.post !== null,
  sidebar: (value) =>
    typeof value.sidebar === 'object' &&
    value.sidebar !== null &&
    Array.isArray((value.sidebar as Record<string, unknown>).widgets),
  comments: (value) => typeof value.comments === 'object' && value.comments !== null,
  seo: (value) =>
    typeof value.toc === 'object' && value.toc !== null && typeof value.og === 'object' && value.og !== null,

  mail: (value) => typeof value.mail === 'object' && value.mail !== null,
  // Each cache bucket carries `prefix` + `ttlSeconds`. Probe walks
  // every required bucket so a row missing newer surfaces (e.g. a
  // legacy install written before `imageMeta` was
  // added) falls through and gets repaired by the registry-default
  // backfill — same pattern as the `rateLimit` probe below. Without
  // this, the admin cache form would crash with
  // `Cannot read properties of undefined (reading 'prefix')` because
  // the editor reads the bundle directly without going through
  // `requireBlogSettingsSection('cache')`'s fallback wrap.
  cache: (value) => {
    if (typeof value.cache !== 'object' || value.cache === null) {
      return false
    }
    const buckets = value.cache as Record<string, unknown>
    for (const id of CACHE_BUCKET_IDS) {
      const slot = buckets[id]
      if (typeof slot !== 'object' || slot === null) {
        return false
      }
      const entry = slot as Record<string, unknown>
      if (typeof entry.prefix !== 'string' || typeof entry.ttlSeconds !== 'number') {
        return false
      }
    }
    return true
  },
  // Each rate-limit bucket carries `windowSeconds` + `maxAttempts`.
  // Probe walks every required bucket so a row missing the new
  // `likeIncreaseIp` surface (e.g. someone hand-edited the JSONB)
  // falls through and gets repaired by the registry-default backfill.
  rateLimit: (value) => {
    for (const key of RATE_LIMIT_BUCKET_KEYS) {
      const bucket = value[key]
      if (typeof bucket !== 'object' || bucket === null) {
        return false
      }
      const slot = bucket as Record<string, unknown>
      if (typeof slot.windowSeconds !== 'number' || typeof slot.maxAttempts !== 'number') {
        return false
      }
    }
    return true
  },
  search: (value) =>
    typeof value.search === 'object' &&
    value.search !== null &&
    typeof (value.search as Record<string, unknown>).enabled === 'boolean' &&
    typeof (value.search as Record<string, unknown>).mode === 'string' &&
    typeof (value.search as Record<string, unknown>).model === 'string' &&
    typeof (value.search as Record<string, unknown>).similarityThreshold === 'number',
  fonts: (value) => {
    for (const slot of ['og', 'calendar'] as const) {
      const v = (value[slot] ?? null) as Record<string, unknown> | null
      if (v === null || typeof v.url !== 'string') {
        return false
      }
    }
    for (const slot of ['globalCss', 'postCss'] as const) {
      const v = value[slot]
      if (!Array.isArray(v) || v.some((entry) => typeof entry !== 'string')) {
        return false
      }
    }
    return true
  },
  cors: (value) =>
    typeof value.cors === 'object' &&
    value.cors !== null &&
    typeof (value.cors as Record<string, unknown>).enabled === 'boolean' &&
    Array.isArray((value.cors as Record<string, unknown>).origins),
  backup: (value) =>
    typeof value.scheduled === 'object' &&
    value.scheduled !== null &&
    typeof (value.scheduled as Record<string, unknown>).enabled === 'boolean' &&
    typeof value.retention === 'object' &&
    value.retention !== null &&
    typeof (value.retention as Record<string, unknown>).enabled === 'boolean',
  limits: (value) => typeof value.maxRequestBodySize === 'number' && typeof value.sessionMaxAge === 'number',
}

// Dynamic key-value assembly for the settings bundle. The bundle is a
// strongly-typed `BlogSettingsBundle` but is assembled from DB rows whose
// section keys come from a registry. The cast is consolidated into these
// two helpers so the rest of the module uses typed access.
function bundleSet(bundle: BlogSettingsBundle, key: string, value: unknown): void {
  ;(bundle as BundleWithIndex)[key] = value
}

function bundleHas(bundle: BlogSettingsBundle, key: string): boolean {
  return (bundle as BundleWithIndex)[key] !== null
}

// Project the canonical `BUNDLE_KEYS` list (mirrors `SETTINGS_SECTIONS`)
// into a freshly-nulled bundle. Adding a section in
// `@/shared/config/settings.ts` automatically extends this — there is no
// sibling 12-line `null` literal to also remember.
function emptyBundle(): BlogSettingsBundle {
  return Object.fromEntries(BUNDLE_KEYS.map((key) => [key, null])) as BundleWithIndex
}

async function loadSettingsFromDb(): Promise<BlogSettingsBundle | null> {
  // Intentionally NOT wrapped in a try/catch: DB errors must propagate
  // up to `hydrateBlogSettings()` so the failed promise can be evicted
  // from the cache. Otherwise a transient outage on the very first
  // hydration would permanently pin the snapshot at "uninstalled" and
  // deadlock every subsequent request behind the install redirect.
  const rows = await findSettingsByScopePrefix(SETTINGS_SCOPE_PREFIX)
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
    const data = row.data as Record<string, unknown> | null | undefined
    if (data === null || typeof data !== 'object') {
      log.warn('Setting row has non-object data; skipping', { scope: row.scope })
      continue
    }
    if (!PROBES[section](data)) {
      log.warn('Setting row failed shape probe; skipping', { scope: row.scope })
      continue
    }
    const meta = SECTION_REGISTRY[section]
    // The bucket field carries the same DTO shape as the row's `data`;
    // the cast is a deliberate boundary widening that the probe above
    // backs.
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
  await backfillMissingSectionDefaults(bundle)

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
async function backfillMissingSectionDefaults(bundle: BlogSettingsBundle): Promise<void> {
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
      await upsertSetting(payload, null, meta.scope)
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
export async function hydrateBlogSettings(): Promise<BlogSettingsBundle | null> {
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
      const value = await loadSettingsFromDb()
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
export async function refreshBlogSettings(): Promise<BlogSettingsBundle | null> {
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  const result = await hydrateBlogSettings()
  await bumpSettingsVersion()
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
if (typeof process === 'undefined' || process.env.VITEST !== 'true') {
  void hydrateBlogSettings().catch((error) => {
    log.error('Initial blog settings hydration failed', { error })
  })
}

/** Test-only: replace the snapshot synchronously. */
export function setBlogSettingsBundleForTests(value: BlogSettingsBundle | null | undefined): void {
  BLOG_SETTINGS_SNAPSHOT_SLOT.write(value)
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(value === undefined ? undefined : Promise.resolve(value ?? null))
}

// `SETTINGS_SECTIONS` is exported for `service.ts` and tests that
// need to enumerate the registry.
export { SETTINGS_SECTIONS }
