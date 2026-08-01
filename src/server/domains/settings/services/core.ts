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

export async function updateBlogSettingsSection<S extends SettingsSection>(
  db: Database,
  section: S,
  payload: unknown,
  updatedBy: number | null,
): Promise<BlogSettingsBundle | null> {
  const meta = SECTION_REGISTRY[section]
  // Strict key check before any DB work: unknown keys (loader mask
  // fields, renamed keys) are a client bug — 400 with the issue list. The
  // assertion signature types the passing payload for the merge below.
  assertSectionPatchKeys(section, payload)

  // Sync transaction (node:sqlite). The snapshot refresh runs right
  // after commit — same macrotask, so no reader can interleave.
  db.transaction((tx) => {
    // The stored row is the only honest write base: merge the patch onto
    // it (objects merge, arrays replace), then validate the merged
    // section. This single read also feeds the secret/branding
    // preservation in `applySectionPatch`.
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
      // `parsed.data` came from this very schema's safeParse above, so
      // the typed re-parse cannot fail — it only recovers the concrete
      // SecuritySettings shape the generic `meta.schema` erases.
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

    // Every section schema is a z.object, so the validated output IS a
    // plain record; the generic `meta.schema: z.ZodType` just cannot
    // prove it.
    const validated = unsafeCast<Record<string, unknown>>(parsed.data)
    const nextRow = applySectionPatch(section, validated, storedRow)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    upsertSetting(tx, encryptedRow, updatedBy, meta.scope)
  })
  const bundle = await refreshBlogSettings(db)

  const handler = sectionChangeHandler(section)
  if (handler) {
    try {
      await handler()
    } catch (e: unknown) {
      log.error('Section change handler failed', { section, error: String(e) })
    }
  }

  return bundle
}

/**
 * Normalize the merge base for a section write: the stored row through
 * the same lenient parse the read path performs (hydrate.ts), the
 * registry defaults when no row exists, or `{}` for the two sections
 * that ship no defaults (general / assets — their setup-time first write
 * must arrive complete, which the merged validation enforces). The
 * schema's `.default()`s stay reachable here, so a field missing from
 * BOTH the stored row and the patch still gets its backfill default.
 */
function resolveMergeBase(meta: SectionMeta, storedRow: Setting | null): Record<string, unknown> {
  if (storedRow !== null && isRecord(storedRow.data)) {
    const parsed = meta.schema.safeParse(storedRow.data)
    if (parsed.success && isRecord(parsed.data)) {
      return parsed.data
    }
    // A row that fails the schema is treated as absent rather than merged
    // onto a shape we no longer understand — same leniency as hydrate.
    log.warn('Setting row failed schema validation; merging onto section defaults', { scope: meta.scope })
  }
  if (meta.defaults !== null) {
    // The registry owns the one defaults validator — identical thrown
    // message to the hydration backfill path.
    return validateSectionDefaults(meta)
  }
  return {}
}
