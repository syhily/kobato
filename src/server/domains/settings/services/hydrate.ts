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
import {
  bumpSettingsVersion,
  getSettingsVersion,
  readLocalSettingsVersion,
  setLocalSettingsVersion,
} from '@/server/domains/settings/services/version'
import { decryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingsByScopePrefix, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { BUNDLE_KEYS } from '@/shared/config/sections'
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
  const pending = BLOG_SETTINGS_SNAPSHOT_SLOT.readHydration()
  if (pending) {
    const cached = BLOG_SETTINGS_SNAPSHOT_SLOT.read()
    if (cached === null) {
      return pending
    }
    if (readLocalSettingsVersion() > 0) {
      return pending
    }
    const sharedVersion = await getSettingsVersion()
    if (sharedVersion <= readLocalSettingsVersion()) {
      return pending
    }
  }

  BLOG_SETTINGS_SNAPSHOT_SLOT.writeHydration(undefined)
  const targetVersion = await getSettingsVersion()
  const newPending = (async () => {
    try {
      const value = await loadSettingsFromDb(db)
      BLOG_SETTINGS_SNAPSHOT_SLOT.write(value)
      setLocalSettingsVersion(targetVersion)
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
  await bumpSettingsVersion()
  const result = await hydrateBlogSettings(db)
  return result
}
