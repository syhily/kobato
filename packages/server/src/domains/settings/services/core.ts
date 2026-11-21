import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type { Database } from '@kobato/db/database'
import type { Setting } from '@kobato/db/types'
import type { SettingsSection } from '@kobato/settings/sections'
import type { SectionMeta } from '@kobato/settings/sections/registry'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { isValidPasskeyDomain } from '@kobato/auth/network'
import { findSettingByScope, upsertSetting } from '@kobato/db/operations/setting'
import {
  SECTION_REGISTRY,
  sectionWriteSchema,
  validateSectionDefaults,
} from '@kobato/server/domains/settings/sections/registry'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { mergeSectionPatch } from '@kobato/server/domains/settings/services/merge-section-patch'
import { applySectionPatch, encryptSecretsInRow } from '@kobato/server/domains/settings/services/secrets-write'
import { sectionChangeHandler } from '@kobato/server/domains/settings/services/section-changes'
import {
  assertSectionPatchKeys,
  INVALID_SETTINGS_DESCRIPTOR,
  isRecord,
} from '@kobato/server/domains/settings/services/section-patch'
import { descriptorFor, zodIssuesToWire } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { validateS3Config } from '@kobato/server/infra/storage/backends/s3'
import { getBlogSettingsBundleSync } from '@kobato/settings/getters'
import { securitySection } from '@kobato/settings/sections/security'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

const log = getLogger('settings.service')

export interface SectionUpdateResult {
  bundle: BlogSettingsBundle | null
  warnings: ErrorMessageDescriptor[]
}

export interface SectionUpdateOptions {
  allowStorageConfigOverride?: boolean
  isStorageMigrationActive?: () => Promise<boolean>
}

export async function updateBlogSettingsSection(
  db: Database,
  section: SettingsSection,
  payload: unknown,
  updatedBy: number | null,
  options?: SectionUpdateOptions,
): Promise<SectionUpdateResult> {
  const meta: SectionMeta = SECTION_REGISTRY[section]
  assertSectionPatchKeys(section, payload)

  if (section === 'assets' && options?.allowStorageConfigOverride !== true) {
    await assertAssetsStoragePatchAllowed(db, payload, options?.isStorageMigrationActive)
  }

  db.transaction((tx) => {
    const storedRow = findSettingByScope(tx, meta.scope) ?? null
    const base = resolveMergeBase(meta, storedRow)
    const merged = mergeSectionPatch(base, payload)
    const parsed = sectionWriteSchema(section, meta).safeParse(merged)
    if (!parsed.success) {
      throw new DomainError('BAD_REQUEST', INVALID_SETTINGS_DESCRIPTOR, zodIssuesToWire(parsed.error.issues))
    }
    if (section === 'security') {
      const securityPayload = securitySection.schema.parse(parsed.data)
      if (securityPayload.passkey.enabled) {
        const current = getBlogSettingsBundleSync()
        const website = current?.siteIdentity?.website
        if (!website) {
          throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.security.error.passkeyDomainRequired'))
        }
        if (!isValidPasskeyDomain(website)) {
          throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.security.error.passkeyHttpsRequired'))
        }
      }
    }

    const validated = unsafeCast<Record<string, unknown>>(parsed.data)
    const nextRow = applySectionPatch(section, validated, storedRow)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    upsertSetting(tx, encryptedRow, updatedBy, meta.scope)
  })
  const bundle = await refreshBlogSettings(db)

  const warnings: ErrorMessageDescriptor[] = []
  const handler = sectionChangeHandler(section)
  if (handler) {
    try {
      await handler()
    } catch (e: unknown) {
      log.error('Section change handler failed', { section, error: String(e) })
      warnings.push(descriptorFor('admin.settings.warnings.sectionChangeFailed'))
    }
  }

  return { bundle, warnings }
}

async function assertAssetsStoragePatchAllowed(
  db: Database,
  payload: unknown,
  isMigrationActive?: () => Promise<boolean>,
): Promise<void> {
  if (!isRecord(payload) || !isRecord(payload.storage)) {
    return
  }
  if (isMigrationActive !== undefined && (await isMigrationActive())) {
    throw new DomainError('CONFLICT', descriptorFor('admin.settings.assets.error.storageMigrationLocked'))
  }

  const current = getBlogSettingsBundleSync()?.assets?.storage
  const patch = payload.storage
  const merged = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : (current?.enabled ?? false),
    endpoint: typeof patch.endpoint === 'string' ? patch.endpoint : (current?.endpoint ?? ''),
    region: typeof patch.region === 'string' ? patch.region : (current?.region ?? ''),
    bucket: typeof patch.bucket === 'string' ? patch.bucket : (current?.bucket ?? ''),
    accessKeyId: typeof patch.accessKeyId === 'string' ? patch.accessKeyId : (current?.accessKeyId ?? ''),
    secretAccessKey:
      typeof patch.secretAccessKey === 'string' ? patch.secretAccessKey : (current?.secretAccessKey ?? ''),
    forcePathStyle:
      typeof patch.forcePathStyle === 'boolean' ? patch.forcePathStyle : (current?.forcePathStyle ?? false),
    urlTemplate: typeof patch.urlTemplate === 'string' ? patch.urlTemplate : (current?.urlTemplate ?? ''),
  }
  if (current?.enabled === true) {
    const structuralChange =
      merged.enabled !== current.enabled ||
      merged.endpoint !== current.endpoint ||
      merged.region !== current.region ||
      merged.bucket !== current.bucket ||
      merged.forcePathStyle !== current.forcePathStyle
    if (structuralChange) {
      throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.assets.error.storageConfigLocked'))
    }
    if (
      merged.endpoint.trim() === '' ||
      merged.bucket.trim() === '' ||
      merged.accessKeyId.trim() === '' ||
      merged.secretAccessKey.trim() === ''
    ) {
      throw new DomainError('BAD_REQUEST', descriptorFor('admin.settings.assets.error.storageConfigIncomplete'))
    }
  }
  if (merged.endpoint.trim() === '' || merged.bucket.trim() === '' || merged.accessKeyId.trim() === '') {
    return
  }
  const validation = await validateS3Config(merged)
  if (!validation.ok) {
    throw new DomainError('BAD_REQUEST', validation.descriptor)
  }
}

function resolveMergeBase(meta: SectionMeta, storedRow: Setting | null): Record<string, unknown> {
  if (storedRow !== null && isRecord(storedRow.data)) {
    const parsed = meta.schema.safeParse(storedRow.data)
    if (parsed.success && isRecord(parsed.data)) {
      return parsed.data
    }
    log.warn('Setting row failed schema validation; merging onto section defaults', { scope: meta.scope })
  }
  if (meta.defaults !== null) {
    return validateSectionDefaults(meta)
  }
  return {}
}
