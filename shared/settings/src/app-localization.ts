import type { AppLocale } from '@kobato/i18n/locales'
import type { RepresentationRevisions } from '@kobato/settings/representation-scopes'
import type { BlogSettingsSnapshot } from '@kobato/settings/snapshot'
import type { BlogSettingsBundle } from '@kobato/settings/types'

import { DEFAULT_LOCALE } from '@kobato/i18n/locales'
import { getBlogSettingsSnapshotSync } from '@kobato/settings/getters'
import { representationRevisionsFor } from '@kobato/settings/representation-scopes'

export interface AppLocalization {
  locale: AppLocale
  timeZone: string
  timeFormat: string | null
  revision: string
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
