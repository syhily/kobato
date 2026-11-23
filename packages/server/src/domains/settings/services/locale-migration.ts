import type { Database } from '@kobato/db/sqlite/database'
import type { AppLocale } from '@kobato/i18n/locales'

import { findSettingByScope, upsertSetting } from '@kobato/db/sqlite/operations/system/setting'
import { DEFAULT_LOCALE, isKnownLocaleValue, normalizeAppLocale } from '@kobato/i18n/locales'
import { getLogger } from '@kobato/server/infra/logger'
import { generalSection } from '@kobato/settings/sections/general'
import { isRecord } from '@kobato/utils/type-guards'

const log = getLogger('settings.locale-migration')

export interface LocaleMigrationResult {
  changed: boolean
  previous: string | null
  locale: AppLocale
}

export function migrateLegacySiteIdentityLocale(db: Database): LocaleMigrationResult {
  const row = findSettingByScope(db, generalSection.scope)
  const data = row?.data
  if (row === null || !isRecord(data)) {
    return { changed: false, previous: null, locale: DEFAULT_LOCALE }
  }

  const raw = data.locale
  const previous = typeof raw === 'string' ? raw : null
  const locale = typeof raw === 'string' ? normalizeAppLocale(raw) : DEFAULT_LOCALE
  if (previous === locale) {
    return { changed: false, previous, locale }
  }

  upsertSetting(db, { ...data, locale }, row.updatedBy ?? null, generalSection.scope)

  if (previous !== null && isKnownLocaleValue(previous)) {
    log.info('Normalized legacy siteIdentity.locale', { from: previous, to: locale })
  } else {
    log.warn('Unrecognized siteIdentity.locale; falling back to the default', { from: previous, to: locale })
  }
  return { changed: true, previous, locale }
}
