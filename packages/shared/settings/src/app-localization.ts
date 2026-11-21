import type { AppLocale } from '@kobato/i18n/locales'
import type { RepresentationRevisions } from '@kobato/settings/representation-scopes'
import type { BlogSettingsSnapshot } from '@kobato/settings/snapshot'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'

export interface AppLocalization {
  locale: AppLocale
  /** The SITE time zone. Never a visitor/browser zone. */
  timeZone: string
  /** `null` = follow the locale's Intl default. Part of the representation fingerprint. */
  timeFormat: string | null
  /**
   * Process-unique request identity (`<bootId>:<counter>`) — locale sync and
   * request correlation only. NEVER use it to key a cache: a settings save
   * would invalidate every representation. Use `revisions.<scope>` instead.
   */
  revision: string
  /**
   * Content-addressed generation per representation scope (detail, listing,
   * feed, calendar, og, manifest, comments), hashed from the sections that
   * scope actually renders. Restart-stable for identical settings.
   */
  revisions: RepresentationRevisions
}

export interface AppSnapshot {
  settings: BlogSettingsBundle | null
  localization: AppLocalization
}

export const PRE_INSTALL_TIME_ZONE = 'UTC'

export function resolveAppLocalization(
  snapshot: BlogSettingsSnapshot = getBlogSettingsSnapshotSync(),
): AppLocalization {
  const siteIdentity = snapshot.bundle?.siteIdentity
  if (siteIdentity === null || siteIdentity === undefined) {
    return {
      locale: DEFAULT_LOCALE,
      timeZone: PRE_INSTALL_TIME_ZONE,
      timeFormat: null,
      revision: snapshot.revision,
      revisions: representationRevisionsFor(snapshot.bundle),
    }
  }
  return {
    locale: siteIdentity.locale,
    timeZone: siteIdentity.timeZone,
    timeFormat: siteIdentity.timeFormat,
    revision: snapshot.revision,
    revisions: representationRevisionsFor(snapshot.bundle),
  }
}

export function captureAppSnapshot(): AppSnapshot {
  const snapshot = getBlogSettingsSnapshotSync()
  return { settings: snapshot.bundle, localization: resolveAppLocalization(snapshot) }
}

export function createLazyAppSnapshot(): () => AppSnapshot {
  let captured: AppSnapshot | null = null
  return () => {
    captured ??= captureAppSnapshot()
    return captured
  }
}
