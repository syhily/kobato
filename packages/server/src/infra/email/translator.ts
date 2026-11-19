// The email boundary's translator. Every send resolves the SITE locale at send
// time (settings snapshot → `resolveAppLocalization`) and hands the translator
// down to the template as an explicit prop — no template reads a module-level
// "current locale", and background jobs never inherit a request's locale.

import type { ServerTranslator } from '@kobato/server/infra/i18n.ts'

import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { resolveAppLocalization } from '@kobato/settings/app-localization.ts'

export function emailTranslator(): ServerTranslator {
  return createServerTranslator(resolveAppLocalization().locale)
}
