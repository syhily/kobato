// The one resolver for "which UI locale and site time zone does this render
// use", derived from the settings snapshot. Every surface that needs the pair
// (request context, content.bootstrap, meta) goes through this module — never a
// per-call re-derivation, never a locale → time zone inference.
//
// UI locale and site time zone are separate facts: `en-US` + `Asia/Shanghai`
// is a valid configuration, and the browser time zone stays analytics-only.

import type { BlogSettingsBundle } from '@/shared/config/types'
import type { AppLocale } from '@/shared/i18n/locales'

import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'

export interface AppLocalization {
  locale: AppLocale
  /** The SITE time zone. Never a visitor/browser zone. */
  timeZone: string
}

/** Pre-install only: nothing date-bearing renders before the setup form writes settings. */
export const PRE_INSTALL_TIME_ZONE = 'UTC'

/**
 * Resolve the localization pair for the current settings snapshot (or an
 * explicit bundle). Falls back to the default locale + UTC pre-install.
 */
export function resolveAppLocalization(bundle?: BlogSettingsBundle | null): AppLocalization {
  const siteIdentity = (bundle ?? getBlogSettingsBundleSync())?.siteIdentity
  if (siteIdentity === null || siteIdentity === undefined) {
    return { locale: DEFAULT_LOCALE, timeZone: PRE_INSTALL_TIME_ZONE }
  }
  return { locale: siteIdentity.locale, timeZone: siteIdentity.timeZone }
}

/**
 * Per-request lazy memo for the pair: resolve on FIRST access, then pin it for
 * that request. Request context is derived before settings hydrate, so the
 * accessor must not read the snapshot eagerly — every surface that builds a
 * RequestContext projects this accessor instead of a resolved value.
 */
export function createLazyAppLocalization(): () => AppLocalization {
  let resolved: AppLocalization | null = null
  return () => {
    resolved ??= resolveAppLocalization()
    return resolved
  }
}
