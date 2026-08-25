import type { SectionMeta } from '@/server/domains/settings/sections/registry'
import type { Database } from '@/server/infra/db/database'
import type { Setting } from '@/server/infra/db/types'
import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { SECTION_REGISTRY, validateSectionDefaults } from '@/server/domains/settings/sections/registry'
import { securitySection } from '@/server/domains/settings/sections/security'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { applySectionPatch, encryptSecretsInRow } from '@/server/domains/settings/services/secrets-write'
import { sectionChangeHandler } from '@/server/domains/settings/services/section-changes'
import { assertSectionPatchKeys, isRecord } from '@/server/domains/settings/services/section-patch'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { validateS3Config } from '@/server/infra/storage/backends/s3'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { mergeSectionPatch } from '@/shared/config/merge-section-patch'
import { isValidPasskeyDomain } from '@/shared/utils/safe-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('settings.service')

export interface SectionUpdateResult {
  bundle: BlogSettingsBundle | null
  /**
   * Honest side-effect failures: the row IS persisted but a registered change handler
   * threw, so derived state is stale until the next successful save or restart (P1-5).
   */
  warnings: string[]
}

export interface SectionUpdateOptions {
  /**
   * Internal escape hatch for the storage migration task: allows patching a
   * LOCKED `assets.storage` config. Regular admin saves never pass this.
   */
  allowStorageConfigOverride?: boolean
  /**
   * Storage-migration lock probe, injected by the HTTP perimeter (Core may
   * not import the storage domain): when it resolves `true`, storage.*
   * patches are rejected with CONFLICT. Absent → treated as no active
   * migration (internal callers never patch storage through this pipeline).
   */
  isStorageMigrationActive?: () => Promise<boolean>
}

export async function updateBlogSettingsSection(
  db: Database,
  section: SettingsSection,
  payload: unknown,
  updatedBy: number | null,
  options?: SectionUpdateOptions,
): Promise<SectionUpdateResult> {
  const meta = SECTION_REGISTRY[section]
  // Strict key check before any DB work — unknown keys are a client bug; the
  // assertion signature types the passing payload for the merge below.
  assertSectionPatchKeys(section, payload)

  if (section === 'assets' && options?.allowStorageConfigOverride !== true) {
    // Lock + first-enable connectivity validation; async, so it runs before the sync transaction.
    await assertAssetsStoragePatchAllowed(db, payload, options?.isStorageMigrationActive)
  }

  // Sync transaction; the snapshot refresh runs in the same macrotask, so no reader can interleave.
  db.transaction((tx) => {
    // The stored row is the only honest write base; this single read also feeds
    // the secret/branding preservation in `applySectionPatch`.
    const storedRow = findSettingByScope(tx, meta.scope) ?? null
    const base = resolveMergeBase(meta, storedRow)
    const merged = mergeSectionPatch(base, payload)
    const parsed = meta.schema.safeParse(merged)
    if (!parsed.success) {
      throw new DomainError(
        'BAD_REQUEST',
        '设置数据无效',
        parsed.error.issues.map((issue) => ({
          message: issue.message,
          path: issue.path.map(String),
        })),
      )
    }
    if (section === 'security') {
      // Cannot fail — it only recovers the concrete SecuritySettings shape the generic `meta.schema` erases.
      const securityPayload = securitySection.schema.parse(parsed.data)
      if (securityPayload.passkey.enabled) {
        const current = getBlogSettingsBundleSync()
        const website = current?.siteIdentity?.website
        if (!website) {
          throw new DomainError('BAD_REQUEST', '开启 Passkey 前请先配置站点域名（网站信息设置中的「站点地址」）')
        }
        if (!isValidPasskeyDomain(website)) {
          throw new DomainError(
            'BAD_REQUEST',
            '开启 Passkey 需要站点使用公开可访问的 HTTPS 域名（不能使用 localhost 或 IP 地址）',
          )
        }
      }
    }

    // Every section schema is a z.object, so the validated output IS a plain record — the generic type just cannot prove it.
    const validated = unsafeCast<Record<string, unknown>>(parsed.data)
    const nextRow = applySectionPatch(section, validated, storedRow)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    upsertSetting(tx, encryptedRow, updatedBy, meta.scope)
  })
  const bundle = await refreshBlogSettings(db)

  const warnings: string[] = []
  const handler = sectionChangeHandler(section)
  if (handler) {
    try {
      await handler()
    } catch (e: unknown) {
      // The write already committed — report the handler failure as an explicit warning, not an error.
      log.error('Section change handler failed', { section, error: String(e) })
      warnings.push('设置已保存，但关联任务未能重新应用；新设置可能要重启后才会完全生效。')
    }
  }

  return { bundle, warnings }
}

/**
 * Guard for `assets` patches touching `storage.*`:
 * 1. A running storage migration owns the config — reject with CONFLICT
 *    (the probe is injected by the perimeter; see {@link SectionUpdateOptions}).
 * 2. Once S3 is enabled the config is locked — EXCEPT a patch that changes
 *    only `accessKeyId` / `secretAccessKey` / `urlTemplate` (credential
 *    rotation / CDN template tweaks); structural changes (endpoint, region,
 *    bucket, path-style, the toggle) go through the migration wizard
 *    (`/admin/library/storage`), not this pipeline.
 * 3. Every patch allowed through — first-time configuration / enablement AND
 *    a locked-state credential/template change — probes the merged config
 *    (HeadBucket) and rejects when it cannot connect.
 */
async function assertAssetsStoragePatchAllowed(
  db: Database,
  payload: unknown,
  isMigrationActive?: () => Promise<boolean>,
): Promise<void> {
  if (!isRecord(payload) || !isRecord(payload.storage)) {
    return
  }
  if (isMigrationActive !== undefined && (await isMigrationActive())) {
    throw new DomainError('CONFLICT', '存储迁移进行中，暂不能修改 S3 配置')
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
    // Locked: only credentials and the URL template may move; every structural
    // field must match the persisted config exactly.
    const structuralChange =
      merged.enabled !== current.enabled ||
      merged.endpoint !== current.endpoint ||
      merged.region !== current.region ||
      merged.bucket !== current.bucket ||
      merged.forcePathStyle !== current.forcePathStyle
    if (structuralChange) {
      throw new DomainError('BAD_REQUEST', 'S3 配置已锁定；如需变更请使用存储迁移功能（媒体管理 → 存储管理）')
    }
    // An enabled config must stay complete — an exempt patch that empties a
    // required field must not slip through unprobed.
    if (
      merged.endpoint.trim() === '' ||
      merged.bucket.trim() === '' ||
      merged.accessKeyId.trim() === '' ||
      merged.secretAccessKey.trim() === ''
    ) {
      throw new DomainError('BAD_REQUEST', 'S3 配置不完整：Endpoint / Bucket / Access Key / Secret 均不能为空')
    }
  }
  // Only probe a config that looks complete; incomplete patches fall through to schema validation.
  if (merged.endpoint.trim() === '' || merged.bucket.trim() === '' || merged.accessKeyId.trim() === '') {
    return
  }
  const validation = await validateS3Config(merged)
  if (!validation.ok) {
    throw new DomainError('BAD_REQUEST', validation.message)
  }
}

/**
 * Merge base: the stored row through the same lenient parse as hydrate, registry defaults
 * when no row exists, or `{}` for sections that ship no defaults (general / assets).
 */
function resolveMergeBase(meta: SectionMeta, storedRow: Setting | null): Record<string, unknown> {
  if (storedRow !== null && isRecord(storedRow.data)) {
    const parsed = meta.schema.safeParse(storedRow.data)
    if (parsed.success && isRecord(parsed.data)) {
      return parsed.data
    }
    // A schema-failing row is treated as absent — same leniency as hydrate.
    log.warn('Setting row failed schema validation; merging onto section defaults', { scope: meta.scope })
  }
  if (meta.defaults !== null) {
    // The registry owns the one defaults validator, shared with the hydration backfill path.
    return validateSectionDefaults(meta)
  }
  return {}
}
