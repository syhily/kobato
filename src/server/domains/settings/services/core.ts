import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import type { z } from 'zod'

import type { SectionMeta } from '@/server/domains/settings/sections/registry'
import type { Setting } from '@/server/infra/db/types'
import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle, SecretMasks } from '@/shared/config/types'

import { SECRET_FIELDS } from '@/server/domains/settings/secrets'
import { SECTION_REGISTRY, validateSectionDefaults } from '@/server/domains/settings/sections/registry'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { SECTION_CHANGE_HANDLERS } from '@/server/domains/settings/services/section-changes'
import { assertSectionPatchKeys } from '@/server/domains/settings/services/section-patch'
import { encryptIfNeeded } from '@/server/infra/crypto/secret-encryption'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { checkMailReady } from '@/server/infra/email/sender'
import { DomainError } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { mergeSectionPatch } from '@/shared/config/merge-section-patch'
import {
  assetsLoaderShapeSchema,
  mailLoaderShapeSchema,
  projectAssetsForAdmin,
  projectMailForAdmin,
  projectSearchForAdmin,
  searchLoaderShapeSchema,
} from '@/shared/config/projection'
import { SECTION_TO_BUNDLE_KEY } from '@/shared/config/sections'
import { isValidPasskeyDomain } from '@/shared/utils/safe-url'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('settings.service')

export async function updateBlogSettingsSection<S extends SettingsSection>(
  db: NodePgDatabase,
  pool: Pool,
  section: S,
  payload: unknown,
  updatedBy: bigint | null,
): Promise<BlogSettingsBundle | null> {
  const meta = SECTION_REGISTRY[section]
  // Strict key check before any DB work: unknown keys (loader mask
  // fields, renamed keys) are a client bug — 400 with the issue list.
  assertSectionPatchKeys(section, payload)

  const bundle = await db.transaction(async (tx) => {
    // The stored row is the only honest write base: merge the patch onto
    // it (objects merge, arrays replace), then validate the merged
    // section. Reading inside the transaction keeps the merge base and
    // the upsert atomic, and this single read also feeds the
    // secret/branding preservation in `applySectionPatch`.
    const storedRow = (await findSettingByScope(tx, meta.scope)) ?? null
    const base = resolveMergeBase(meta, storedRow)
    const merged = mergeSectionPatch(base, unsafeCast<Record<string, unknown>>(payload))
    const parsed = await meta.schema.safeParseAsync(merged)
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
      const securityPayload = unsafeCast<{ otp?: { enabled?: boolean }; passkey?: { enabled?: boolean } }>(parsed.data)
      if (securityPayload.otp?.enabled) {
        const current = getBlogSettingsBundleSync()
        const mail = current?.mail?.mail
        if (!mail) {
          throw new DomainError('BAD_REQUEST', '开启 OTP 前请先完成邮件服务配置（接入域名、API Key、发件人邮箱）')
        }
        const ready = checkMailReady(mail)
        if (!ready.ready) {
          throw new DomainError('BAD_REQUEST', `开启 OTP 前请先完成邮件服务配置：${ready.message}`)
        }
      }
      if (securityPayload.passkey?.enabled) {
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

    const nextRow = applySectionPatch(section, parsed.data, storedRow)

    const encryptedRow = encryptSecretsInRow(section, nextRow)
    await upsertSetting(tx, encryptedRow, updatedBy, meta.scope)

    return refreshBlogSettings(tx)
  })

  const handler = SECTION_CHANGE_HANDLERS.get(section)
  if (handler) {
    try {
      await handler(pool)
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
  if (storedRow !== null && storedRow.data !== null && typeof storedRow.data === 'object') {
    const parsed = meta.schema.safeParse(storedRow.data)
    if (parsed.success) {
      return unsafeCast<Record<string, unknown>>(parsed.data)
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

export function computeSecretMasks(bundle: BlogSettingsBundle): SecretMasks {
  const masks = unsafeCast<Record<keyof SecretMasks, string | null>>({})
  for (const { bundleKey, path, field, maskKey } of SECRET_FIELDS) {
    const section = unsafeCast<Record<string, unknown> | null>(bundle[bundleKey])
    const bucket = unsafeCast<Record<string, unknown> | undefined>(section?.[path])
    const value = bucket?.[field]
    masks[maskKey] = typeof value === 'string' && value !== '' ? value.slice(-4) : null
  }
  return masks
}

export function redactSecretsFromBundle(bundle: BlogSettingsBundle): BlogSettingsBundle {
  const clone = unsafeCast<Record<string, unknown>>({ ...bundle })
  for (const { bundleKey, path, field } of SECRET_FIELDS) {
    const section = unsafeCast<Record<string, unknown> | null>(clone[bundleKey])
    if (section === null) {
      continue
    }
    const bucket = unsafeCast<Record<string, unknown> | undefined>(section[path])
    if (bucket && typeof bucket[field] === 'string' && bucket[field] !== '') {
      clone[bundleKey] = {
        ...section,
        [path]: { ...bucket, [field]: '' },
      }
    }
  }
  return unsafeCast<BlogSettingsBundle>(clone)
}

// Per-section runtime gate for the admin display shape: the three masked
// sections validate against their loader-shape Zod twins, every other
// section against the registry schema (its stored shape IS the admin
// shape there). A drifting projection fails HERE — loudly, at the
// assembly point — instead of silently mistyping the save response.
const SECTION_OUTPUT_SCHEMAS: Partial<Record<SettingsSection, z.ZodType>> = {
  assets: assetsLoaderShapeSchema,
  mail: mailLoaderShapeSchema,
  search: searchLoaderShapeSchema,
}

/**
 * Project one section of a fresh bundle into the admin display shape the
 * settings cards expect — the exact TSource contract the layout loader +
 * `routes/admin/settings/index.tsx` produce (assets/mail/search get their
 * masks merged in; every other section is the redacted bundle slice). The
 * update endpoint returns this so the client can adopt the save response
 * as its new baseline instead of revalidating the loader.
 */
export function projectSectionForAdmin(
  section: SettingsSection,
  bundle: BlogSettingsBundle,
  masks: SecretMasks,
): unknown {
  const redacted = redactSecretsFromBundle(bundle)
  let projected: unknown
  if (section === 'assets') {
    projected = projectAssetsForAdmin(unsafeCast(redacted.assets), masks.assetsSecretAccessKeyMask)
  } else if (section === 'mail') {
    projected = projectMailForAdmin(unsafeCast(redacted.mail), {
      apiKeyMask: masks.mailApiKeyMask,
      smtpPassMask: masks.mailSmtpPassMask,
      mailgunApiKeyMask: masks.mailMailgunApiKeyMask,
    })
  } else if (section === 'search') {
    projected = projectSearchForAdmin(redacted.search ?? undefined, masks.searchApiKeyMask)
  } else {
    projected = redacted[SECTION_TO_BUNDLE_KEY[section]]
  }

  const schema = SECTION_OUTPUT_SCHEMAS[section] ?? SECTION_REGISTRY[section].schema
  const result = schema.safeParse(projected)
  if (!result.success) {
    throw new DomainError(
      'INTERNAL',
      `admin 投影形状校验失败(${section}):${result.error.issues[0]?.path.join('.') ?? '<root>'} ${result.error.issues[0]?.message ?? ''}`,
    )
  }
  return result.data
}

function applySectionPatch(
  section: SettingsSection,
  validated: unknown,
  storedRow: Setting | null,
): Record<string, unknown> {
  let row = unsafeCast<Record<string, unknown>>(validated)
  const secretConfigs = SECRET_FIELDS.filter((f) => f.section === section)
  if (secretConfigs.length > 0) {
    // A patch that omits a secret keeps the stored value; a patch that
    // includes every secret is a full overwrite and has nothing to
    // preserve. `storedRow` is the same read the merge base used.
    const needsExisting = secretConfigs.some((config) => !hasSecretInRow(row, config.path, config.field))
    if (needsExisting) {
      for (const secretConfig of secretConfigs) {
        row = preserveSecretOnPatch(row, storedRow, secretConfig.path, secretConfig.field)
      }
    }
  }
  if (section === 'assets') {
    row = preserveBrandingOnPatch(row, storedRow)
  }
  return row
}

function hasSecretInRow(row: Record<string, unknown>, payloadPath: string, secretKey: string): boolean {
  const bucket = unsafeCast<Record<string, unknown> | undefined>(row[payloadPath])
  return bucket !== undefined && secretKey in bucket && bucket[secretKey] !== undefined
}

function preserveBrandingOnPatch(row: Record<string, unknown>, storedRow: Setting | null): Record<string, unknown> {
  const existingBranding = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(storedRow?.data)?.branding,
  )
  const incomingBranding = unsafeCast<Record<string, unknown> | undefined>(row.branding)
  if (existingBranding === undefined && incomingBranding === undefined) {
    return row
  }
  const merged: Record<string, unknown> = { ...existingBranding, ...incomingBranding }
  return { ...row, branding: merged }
}

function preserveSecretOnPatch(
  validated: unknown,
  existingRow: Setting | null,
  payloadPath: string,
  secretKey: string,
): Record<string, unknown> {
  const record = unsafeCast<Record<string, unknown>>(validated)
  const incoming = unsafeCast<Record<string, unknown>>(record[payloadPath]) ?? {}
  if (secretKey in incoming && incoming[secretKey] !== undefined) {
    return record
  }

  const existingPayload = unsafeCast<Record<string, unknown> | undefined>(
    unsafeCast<Record<string, unknown> | undefined>(existingRow?.data)?.[payloadPath],
  )

  // Pass the existing ciphertext through unchanged. encryptSecretsInRow
  // recognises the encrypted prefix and skips re-encryption.
  const previousSecret = typeof existingPayload?.[secretKey] === 'string' ? existingPayload[secretKey] : ''
  const nextPayload: Record<string, unknown> = { ...incoming, [secretKey]: previousSecret }
  return { ...record, [payloadPath]: nextPayload }
}

function encryptSecretsInRow(section: SettingsSection, row: Record<string, unknown>): Record<string, unknown> {
  const configs = SECRET_FIELDS.filter((f) => f.section === section)
  if (configs.length === 0) {
    return row
  }
  const next: Record<string, unknown> = { ...row }
  for (const config of configs) {
    const bucket = unsafeCast<Record<string, unknown> | undefined>(next[config.path])
    if (!bucket) {
      continue
    }
    const value = bucket[config.field]
    if (typeof value !== 'string') {
      continue
    }
    Object.assign(bucket, { [config.field]: encryptIfNeeded(value) })
  }
  return next
}
