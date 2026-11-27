import type { ContentBootstrapI18n } from '@kobato/api/contracts/public/content'
import type { BlogSettingsBundle } from '@kobato/settings/types'
import type { DocumentFacts } from '@kobato/ui/lib/document-facts-context'

import { fallbackMessages } from '@kobato/i18n/fallback-messages'
import { DEFAULT_LOCALE } from '@kobato/i18n/locales'

export interface DocumentFactsSource {
  i18n?: ContentBootstrapI18n | null
  theme?: DocumentFacts['theme']
  fonts?: DocumentFacts['fonts']
  blogSettings?: BlogSettingsBundle | null
  nowIso?: string
  csrfToken?: string
}

export function documentFactsFrom(data: DocumentFactsSource | undefined): DocumentFacts {
  const i18n = data?.i18n ?? null
  return {
    locale: i18n?.locale ?? DEFAULT_LOCALE,
    messages: i18n?.messages ?? fallbackMessages,
    revision: i18n?.revision,
    theme: data?.theme ?? null,
    fonts: data?.fonts ?? null,
    settings: data?.blogSettings ?? undefined,
    nowIso: data?.nowIso,
    csrfToken: data?.csrfToken,
    labels: i18n?.inklingLabels,
  }
}
