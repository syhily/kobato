import type { ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { Database } from '@kobato/db/sqlite/database'
import type { SettingsSection } from '@kobato/settings/sections'
import type { AssetsSettings, SiteIdentitySettings } from '@kobato/settings/types'

import { upsertSetting } from '@kobato/db/sqlite/operations/system/setting'
import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales'
import { buildDefaultSectionPayloads } from '@kobato/server/domains/settings/sections/registry'
import { descriptorFor, messageDescriptor } from '@kobato/server/infra/http/error-descriptor'
import { ASSETS_STORAGE_INSTALL_DEFAULTS } from '@kobato/settings/sections/assets'
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry'
import { unsafeCast } from '@kobato/utils/unsafe-cast'

export interface InstallSeedInput {
  title: string
  name: string
  email: string
  hostname: string
  locale?: AppLocale
}

export interface InstallSectionRow {
  scope: string
  payload: Record<string, unknown>
}

export type InstallSectionRowsResult =
  | { ok: true; rows: InstallSectionRow[] }
  | { ok: false; descriptor: ErrorMessageDescriptor }

export function buildInstallSectionRows(input: InstallSeedInput): InstallSectionRowsResult {
  const { title, name, email, hostname, locale = DEFAULT_LOCALE } = input
  const siteIdentity: SiteIdentitySettings = {
    title,
    titleSeparator: '-',
    description: 'Welcome',
    website: `https://${hostname}`,
    keywords: [],
    author: { name, email, url: `https://${hostname}` },
    locale,
    timeZone: 'Asia/Shanghai',
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

  const rows: InstallSectionRow[] = []
  for (const { section, payload } of sections) {
    const meta = SECTION_REGISTRY[section]
    const check = meta.schema.safeParse(payload)
    if (!check.success) {
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

export function seedInstallSections(db: Database, rows: InstallSectionRow[], updatedBy: number | null): void {
  for (const { scope, payload } of rows) {
    upsertSetting(db, payload, updatedBy, scope)
  }
}
