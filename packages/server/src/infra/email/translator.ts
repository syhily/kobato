// The email boundary's translator. Every send resolves the SITE locale at send
// time (settings snapshot → `resolveAppLocalization`) and hands the translator
// down to the template as an explicit prop — no template reads a module-level
// "current locale", and background jobs never inherit a request's locale.

import { resolveAppLocalization } from '@kobato/shared/i18n/app-localization.ts'

import type { ServerTranslator } from '../i18n'

import { createServerTranslator } from '../i18n'

/** Translator for the current site locale (the site's configured language). */
export function emailTranslator(): ServerTranslator {
  return createServerTranslator(resolveAppLocalization().locale)
}
