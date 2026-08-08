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

export async function updateBlogSettingsSection<S extends SettingsSection>(
  db: Database,
  section: S,
  payload: unknown,
  updatedBy: number | null,
): Promise<SectionUpdateResult> {
  const meta = SECTION_REGISTRY[section]
  // Strict key check before any DB work — unknown keys are a client bug; the
  // assertion signature types the passing payload for the merge below.
  assertSectionPatchKeys(section, payload)

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
