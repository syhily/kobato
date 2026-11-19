import type { ServerTranslator } from '@kobato/server/infra/i18n.ts'

import { createServerTranslator } from '@kobato/server/infra/i18n.ts'
import { resolveAppLocalization } from '@kobato/settings/app-localization.ts'

export function emailTranslator(): ServerTranslator {
  return createServerTranslator(resolveAppLocalization().locale)
}
