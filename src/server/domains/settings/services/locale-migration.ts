// One-time, idempotent normalization of the persisted `siteIdentity.locale`: legacy
// bare or script-qualified BCP 47 tags are rewritten once BEFORE the settings snapshot
// is built, so every downstream consumer (cache keys, ETag inputs, feed/email rendering)
// sees exactly one canonical tag. The read schema canonicalizes the same aliases, so a
// legacy value can never drop the section (and with it the whole install). No
// `system.*` flag row: settings are single-row data, unlike the corpus-wide backfills
// that need a flag — re-running is safe, a canonical value performs zero writes and
// logs nothing.

import type { Database } from '@/server/infra/db/database'
import type { AppLocale } from '@/shared/i18n/locales'

import { generalSection } from '@/server/domains/settings/sections/general'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'
import { getLogger } from '@/server/infra/logger'
import { DEFAULT_LOCALE, isKnownLocaleValue, normalizeAppLocale } from '@/shared/i18n/locales'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('settings.locale-migration')

export interface LocaleMigrationResult {
  /** Whether the stored row was rewritten. */
  changed: boolean
  /** The raw stored value before the pass; `null` when the row or key is absent. */
  previous: string | null
  /** The canonical value the row holds after the pass. */
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
    // The one place an unknown tag is announced: it is otherwise silently
    // canonicalized to the default on every read.
    log.warn('Unrecognized siteIdentity.locale; falling back to the default', { from: previous, to: locale })
  }
  return { changed: true, previous, locale }
}
