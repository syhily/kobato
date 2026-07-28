// Install-time seed of every settings section — the strict counterpart
// to hydrate.ts's lazy backfill: writes all 18 section rows for a FRESH
// install in one all-or-nothing pass (`blog.general` and `blog.assets`
// from the install-form identity, the other 16 from registry defaults).
// `buildInstallSectionRows` validates every section BEFORE any write so
// a failure produces a form error with zero DB side effects;
// `seedInstallSections` persists the validated rows on the caller's
// transaction so they commit atomically with the first admin row.

import type { Database } from '@/server/infra/db/database'
import type { SettingsSection } from '@/shared/config/sections'
import type { AssetsSettings, SiteIdentitySettings } from '@/shared/config/types'

import { ASSETS_STORAGE_INSTALL_DEFAULTS } from '@/server/domains/settings/sections/assets'
import { buildDefaultSectionPayloads, SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { upsertSetting } from '@/server/infra/db/operations/setting'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

/** Install-form identity the seed is built from: site title, the first admin's name/email, and the request hostname. */
export interface InstallSeedInput {
  title: string
  name: string
  email: string
  hostname: string
}

/** One validated section row ready to persist: DB scope + schema-parsed payload. */
export interface InstallSectionRow {
  scope: string
  payload: Record<string, unknown>
}

export type InstallSectionRowsResult = { ok: true; rows: InstallSectionRow[] } | { ok: false; message: string }

/**
 * Build and validate all 18 section rows for a fresh install. Returns
 * the first validation failure as a user-facing message; a registry
 * default that drifted from its schema keeps `buildDefaultSectionPayloads`'
 * thrown DomainError (a build bug, identical to the hydration backfill
 * path) — only the form-derived sections can fail softly here.
 */
export function buildInstallSectionRows(input: InstallSeedInput): InstallSectionRowsResult {
  const { title, name, email, hostname } = input
  const siteIdentity: SiteIdentitySettings = {
    title,
    description: 'Welcome',
    website: `https://${hostname}`,
    keywords: [],
    author: { name, email, url: `https://${hostname}` },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: new Date().getFullYear(),
    icpNo: '',
    moeIcpNo: '',
  }

  const assets: AssetsSettings = {
    asset: { host: hostname, scheme: 'https' },
    ...ASSETS_STORAGE_INSTALL_DEFAULTS,
  }

  const sections: { section: SettingsSection; payload: Record<string, unknown> }[] = [
    { section: 'general', payload: { ...siteIdentity } },
    { section: 'assets', payload: { ...assets } },
    ...buildDefaultSectionPayloads(),
  ]

  // Validate every section against its schema before writing any.
  const rows: InstallSectionRow[] = []
  for (const { section, payload } of sections) {
    const meta = SECTION_REGISTRY[section]
    const check = meta.schema.safeParse(payload)
    if (!check.success) {
      const first = check.error.issues[0]
      const path = first ? first.path.join('.') : '<unknown>'
      return { ok: false, message: `${meta.scope} 校验失败（${path}）：${first?.message ?? '未知错误'}` }
    }
    rows.push({ scope: meta.scope, payload: unsafeCast<Record<string, unknown>>(check.data) })
  }
  return { ok: true, rows }
}

/**
 * Persist pre-validated rows in order on the caller's handle. The install
 * flow passes the transaction that also inserts the admin row, so all 18
 * upserts participate in that transaction's commit/rollback.
 */
// Sync (node:sqlite): called inside the install transaction.
export function seedInstallSections(db: Database, rows: InstallSectionRow[], updatedBy: number | null): void {
  for (const { scope, payload } of rows) {
    upsertSetting(db, payload, updatedBy, scope)
  }
}
