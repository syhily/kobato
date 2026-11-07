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
import { IntlContext, IntlProvider } from 'react-intl'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { getLogger } from '@/client/lib/logger'

const log = getLogger('i18n')

/**
 * ICU values accepted by react-intl: plain interpolation values plus the
 * rich-text form (`<link>{title}</link>`) — a function receiving the tag's
 * chunks. Never build sentences by concatenating translated fragments.
 */
export type I18nMessageParams = Record<
  string,
  string | number | Date | null | undefined | ReactNode | ((chunks: ReactNode[]) => ReactNode)
>

export interface I18nValue {
  locale: AppLocale
  /** Format one UI message id; `params` fill the ICU placeholders. Plain string result. */
  t: (id: UiMessageId, params?: I18nMessageParams) => string
  /**
   * Rich-text form for messages with `<tag>…</tag>` placeholders (e.g. a link
   * inside a sentence). Returns a React node so the interpolation stays one
   * message per locale instead of concatenated fragments.
   */
  tRich: (id: UiMessageId, params: I18nMessageParams) => ReactNode
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
  // Strict on purpose: a component rendered outside the root provider is an
  // integration bug, not a case to paper over with a partial catalog.
  const intl = useContext(IntlContext)
  if (intl === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  // Plain messages never carry rich tags, so the string narrowing is exact.
  const t = useCallback<I18nValue['t']>(
    (id, params) => {
      const formatted = intl.formatMessage({ id }, params)
      // Plain messages never carry rich tags, so react-intl returns a string.
      return typeof formatted === 'string' ? formatted : ''
    },
    [intl],
  )
  const tRich = useCallback<I18nValue['tRich']>((id, params) => intl.formatMessage({ id }, params) as ReactNode, [intl])
  if (locale === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  return { locale, t, tRich }
}
