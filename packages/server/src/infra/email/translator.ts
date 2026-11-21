import type { ServerTranslator } from '@kobato/server/infra/i18n'

import { createServerTranslator } from '@kobato/server/infra/i18n'
import { resolveAppLocalization } from '@kobato/settings/app-localization'

export function emailTranslator(): ServerTranslator {
  return createServerTranslator(resolveAppLocalization().locale)
}
