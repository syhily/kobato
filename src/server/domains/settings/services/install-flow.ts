// Install-time seed of every settings section — the strict counterpart to hydrate's lazy
// backfill: all 17 rows validated BEFORE any write, then persisted on the caller's
// transaction so they commit atomically with the first admin row.

import type { Database } from '@/server/infra/db/database'
import type { SettingsSection } from '@/shared/config/sections'
import type { AssetsSettings, SiteIdentitySettings } from '@/shared/config/types'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { ASSETS_STORAGE_INSTALL_DEFAULTS } from '@/server/domains/settings/sections/assets'
import { buildDefaultSectionPayloads, SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { upsertSetting } from '@/server/infra/db/operations/setting'
import { descriptorFor, messageDescriptor } from '@/server/infra/http/error-descriptor'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface InstallSeedInput {
  title: string
  name: string
  email: string
  hostname: string
}

/** One validated section row ready to persist: schema-parsed payload. */
export interface InstallSectionRow {
  scope: string
  payload: Record<string, unknown>
}

export type InstallSectionRowsResult =
  | { ok: true; rows: InstallSectionRow[] }
  | { ok: false; descriptor: ErrorMessageDescriptor }

/**
 * Build and validate all 17 section rows for a fresh install. The first validation
 * failure returns as a user-facing message; registry-default drift keeps its thrown DomainError.
 */
export function buildInstallSectionRows(input: InstallSeedInput): InstallSectionRowsResult {
  const { title, name, email, hostname } = input
  const siteIdentity: SiteIdentitySettings = {
    title,
    titleSeparator: '-',
    description: 'Welcome',
    website: `https://${hostname}`,
    keywords: [],
    author: { name, email, url: `https://${hostname}` },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    // Follow the locale's Intl default; admins may pin a custom token pattern later.
    timeFormat: null,
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
      // Registry-drift diagnostic: interpolate the offending path and the
      // issue's English fallback (never a raw catalog id) into the copy.
      const first = check.error.issues[0]
      const path = first ? first.path.join('.') : '<unknown>'
      return {
        ok: false,
        descriptor: descriptorFor('auth.setup.error.seedInvalid', {
          scope: meta.scope,
          path,
          message: first === undefined ? '' : messageDescriptor(first.message).fallbackMessage,
        }),
      }
    }
    rows.push({ scope: meta.scope, payload: unsafeCast<Record<string, unknown>>(check.data) })
  }
  return { ok: true, rows }
}

/**
 * Persist pre-validated rows in order on the caller's handle — the install flow passes
 * the transaction that also inserts the admin row, so all upserts commit atomically.
 */
export function seedInstallSections(db: Database, rows: InstallSectionRow[], updatedBy: number | null): void {
  for (const { scope, payload } of rows) {
    upsertSetting(db, payload, updatedBy, scope)
  }
}
