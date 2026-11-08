// The one resolver for "which UI locale, site time zone and representation
// generation does this render use", derived from the settings snapshot. Every
// surface that needs it (request context, content.bootstrap, meta, cache keys,
// ETags) goes through this module — never a per-call re-derivation, never a
// locale → time zone inference.
//
// UI locale and site time zone are separate facts: `en-US` + `Asia/Shanghai`
// is a valid configuration, and the browser time zone stays analytics-only.
// The boot token (`revision`) is request identity; the per-scope content hashes
// (`revisions`) are what cache keys and ETags consume.

import type { RepresentationRevisions } from '@/shared/config/representation-scopes'
import type { BlogSettingsSnapshot } from '@/shared/config/snapshot'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { getBlogSettingsSnapshotSync } from '@/shared/config/getters'
import { representationRevisionsFor } from '@/shared/config/representation-scopes'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'

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

/** The settings snapshot a representation was captured from, plus its localization. */
export interface AppSnapshot {
  settings: BlogSettingsBundle | null
  localization: AppLocalization
}

/** Pre-install only: nothing date-bearing renders before the setup form writes settings. */
export const PRE_INSTALL_TIME_ZONE = 'UTC'

/**
 * Resolve the localization from an explicit settings snapshot. Omit the
 * argument for the current process snapshot (background jobs: the send-time
 * snapshot). A request must pass the SAME captured snapshot it renders with,
 * so the cache key's revision and the rendered bytes can never disagree.
 */
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

/** One atomic read of bundle + revision, resolved into both request representations. */
export function captureAppSnapshot(): AppSnapshot {
  const snapshot = getBlogSettingsSnapshotSync()
  return { settings: snapshot.bundle, localization: resolveAppLocalization(snapshot) }
}

/**
 * Per-request lazy memo: capture on FIRST access, then pin bundle + revision +
 * localization for that request. Request context is derived before settings
 * hydrate, so the accessor must not read the snapshot eagerly — every surface
 * that builds a RequestContext projects this accessor instead of resolved
 * values. Both `settings` and `localization` MUST come from this one capture.
 */
export function createLazyAppSnapshot(): () => AppSnapshot {
  let captured: AppSnapshot | null = null
  return () => {
    captured ??= captureAppSnapshot()
    return captured
  }
}
