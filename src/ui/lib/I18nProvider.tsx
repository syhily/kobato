// The client-facing i18n surface: react-intl's provider fed with the CURRENT
// locale's UI catalog from the root loader, plus a typed translator.
//
// This module must never value-import the catalogs: the messages arrive as
// props (`content.bootstrap` → root loader), so one locale — not four — reaches
// the browser. The root Layout owns the single provider; the root ErrorBoundary
// falls back to `@/shared/i18n/fallback-messages` when no payload exists.
// Pinned by tests/unit/arch/client-bundle.test.ts.

import type { ReactNode } from 'react'

import { createContext, useCallback, useContext } from 'react'
import { IntlProvider, useIntl } from 'react-intl'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { getLogger } from '@/client/lib/logger'

const log = getLogger('i18n')

/** ICU values accepted by react-intl for message interpolation. */
export type I18nMessageParams = Record<string, string | number | boolean | Date | null | undefined>

export interface I18nValue {
  locale: AppLocale
  /** Format one UI message id; `params` fill the ICU placeholders. */
  t: (id: UiMessageId, params?: I18nMessageParams) => string
}

const LocaleContext = createContext<AppLocale | null>(null)

/**
 * Any message map with string values: a locale's full `UiMessages` on the
 * normal path, or the minimal `FallbackMessages` when the root loader failed.
 */
export type I18nMessages = Record<string, string>

export interface I18nProviderProps {
  locale: AppLocale
  /** The locale's UI catalog (already merged over the English baseline), or the fallback subset. */
  messages: I18nMessages
  children: ReactNode
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  return (
    <IntlProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        // Missing keys degrade to the id at runtime; make the failure visible in the console log channel.
        log.warn('i18n format failure', { locale, error: error.message })
      }}
    >
      <LocaleContext value={locale}>{children}</LocaleContext>
    </IntlProvider>
  )
}

/**
 * Typed translator for UI components. Requires the root `<I18nProvider>`;
 * throwing (rather than silently rendering ids) keeps a missing provider a
 * loud test failure.
 */
export function useI18n(): I18nValue {
  const locale = useContext(LocaleContext)
  const intl = useIntl()
  const t = useCallback<I18nValue['t']>((id, params) => intl.formatMessage({ id }, params), [intl])
  if (locale === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  return { locale, t }
}
