import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import type { BundleKey, SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import {
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  sectionFromScope,
  SETTINGS_SCOPE_PREFIX,
} from '@/server/domains/settings/sections/registry'
import { decryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { BUNDLE_KEYS, SECTION_TO_BUNDLE_KEY, SETTINGS_SECTIONS } from '@/shared/config/sections'
import { BLOG_SETTINGS_SNAPSHOT_SLOT } from '@/shared/config/snapshot'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('settings.snapshot')

function bundleSet(bundle: BlogSettingsBundle, key: BundleKey, value: unknown): void {
  unsafeCast<Record<BundleKey, unknown>>(bundle)[key] = value
}

function bundleHas(bundle: BlogSettingsBundle, key: BundleKey): boolean {
  return unsafeCast<Record<BundleKey, unknown>>(bundle)[key] !== null
}

function emptyBundle(): BlogSettingsBundle {
  return unsafeCast<BlogSettingsBundle>(Object.fromEntries(BUNDLE_KEYS.map((key) => [key, null])))
}

function decryptSecretsInBundle(bundle: BlogSettingsBundle): void {
  for (const { bundleKey, path, field } of SECRET_FIELDS) {
    const sectionData = unsafeCast<Record<string, unknown> | null>(bundle[bundleKey])
    if (sectionData === null) {
      continue
    }
    const bucket = unsafeCast<Record<string, unknown> | undefined>(sectionData[path])
    if (!bucket) {
      continue
    }
    const value = bucket[field]
    if (typeof value === 'string') {
      bucket[field] = decryptIfNeeded(value)
    }
  }
}

async function loadSettingsFromDb(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
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
    const parsed = meta.schema.safeParse(data)
    if (!parsed.success) {
      log.warn('Setting row failed schema validation; skipping', { scope: row.scope })
      continue
    }
    bundleSet(bundle, meta.key, parsed.data)
  }

  if (bundle.siteIdentity === null || bundle.assets === null) {
    return null
  }

  await backfillMissingSectionDefaults(bundle, db)
  decryptSecretsInBundle(bundle)
  return bundle
}

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

export async function hydrateBlogSettings(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
  // Single-process deployment model: the in-process snapshot is always
  // authoritative once loaded.
  //
  // The hydration promise below is the single-flight for the initial load.
  // Semantics: share-in-flight; failure: keep-stale — a failed load drops
  // the flight so the next call retries, but never overwrites the last
  // good snapshot, so settings stay available through a DB outage.
  const pending = BLOG_SETTINGS_SNAPSHOT_SLOT.readHydration()
  if (pending) {
    return pending
  }

  const newPending = (async () => {
    try {
      const value = await loadSettingsFromDb(db)
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(value)
      return value
    } catch (error) {
      BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
      throw error
    }
  })()
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(newPending)
  return newPending
}

export async function refreshBlogSettings(db: NodePgDatabase): Promise<BlogSettingsBundle | null> {
  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  return hydrateBlogSettings(db)
}

/**
 * The admin settings shell's eager backfill: any section the hydrated
 * bundle is missing but that ships registry defaults gets written to the
 * DB and populated into a COPY of the bundle (the hydrated snapshot is
 * shared cache — never mutate it). Best-effort per row: a failed upsert
 * leaves the key null so the caller's completeness check surfaces it.
 *
 * Distinct from the hydration backfill above: that one repairs the
 * snapshot at load time with validated payloads, while this one serves
 * the shell's per-navigation read with the raw registry defaults.
 */
export async function backfillSettingsSections(
  db: NodePgDatabase,
  bundle: BlogSettingsBundle,
): Promise<Record<string, unknown>> {
  const mutable: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(bundle)) {
    mutable[key] = value
  }
  for (const section of SETTINGS_SECTIONS) {
    const key = SECTION_TO_BUNDLE_KEY[section]
    if (mutable[key] !== null) {
      continue
    }
    const meta = SECTION_REGISTRY[section]
    if (meta.defaults === null) {
      continue
    }
    try {
      await upsertSetting(db, meta.defaults, null, meta.scope)
      mutable[key] = meta.defaults
    } catch {
      // Best-effort; the caller's assert surfaces still-missing sections.
    }
  }
  return mutable
}
