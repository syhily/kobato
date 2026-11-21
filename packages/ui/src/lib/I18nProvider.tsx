import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ReactNode } from 'react'

import { getLogger } from '@kobato/ui/lib/logger'
import { createContext, useCallback, useContext } from 'react'
import { IntlContext, IntlProvider } from 'react-intl'

const log = getLogger('i18n')

export type I18nMessageParams = Record<
  string,
  string | number | Date | null | undefined | ReactNode | ((chunks: ReactNode[]) => ReactNode)
>

export type I18nPlainMessageParams = Record<string, string | number | boolean | null | undefined>

const LOCALIZE_FALLBACK_ID: UiMessageId = 'error.api.badRequest'
const LOCALIZE_FALLBACK_TEXT = 'Invalid input'

function toIcuValues(params?: I18nPlainMessageParams): Record<string, string | number | null> {
  const values: Record<string, string | number | null> = {}
  for (const [key, param] of Object.entries(params ?? {})) {
    if (param === undefined) {
      continue
    }
    values[key] = typeof param === 'boolean' ? String(param) : param
  }
  return values
}

export interface I18nValue {
  locale: AppLocale
  t: (id: UiMessageId, params?: I18nMessageParams) => string
  tRich: (id: UiMessageId, params: I18nMessageParams) => ReactNode
  localizeMessage: (value: string, params?: I18nPlainMessageParams) => string
}

const LocaleContext = createContext<AppLocale | null>(null)

export type I18nMessages = Record<string, string>

export interface I18nProviderProps {
  locale: AppLocale
  messages: I18nMessages
  children: ReactNode
}

export function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  return (
    <IntlProvider
      locale={locale}
      messages={messages}
      onError={(error) => {
        log.warn('i18n format failure', { locale, error: error.message })
      }}
    >
      <LocaleContext value={locale}>{children}</LocaleContext>
    </IntlProvider>
  )
}

export function useI18n(): I18nValue {
  const locale = useContext(LocaleContext)
  const intl = useContext(IntlContext)
  if (intl === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  const t = useCallback<I18nValue['t']>(
    (id, params) => {
      const formatted = intl.formatMessage({ id }, params)
      return typeof formatted === 'string' ? formatted : ''
    },
    [intl],
  )
  const tRich = useCallback<I18nValue['tRich']>((id, params) => intl.formatMessage({ id }, params) as ReactNode, [intl])
  if (locale === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  const localizeMessage = (value: string, params?: I18nPlainMessageParams): string => {
    const messages: Record<string, unknown> = intl.messages
    const candidate = Object.hasOwn(messages, value) ? messages[value] : undefined
    if (typeof candidate !== 'string') {
      return value
    }
    if (!candidate.includes('{')) {
      return candidate
    }
    const values = toIcuValues(params)
    try {
      const formatted = intl.formatMessage({ id: value }, values)
      if (typeof formatted === 'string' && formatted !== value && formatted !== candidate) {
        return formatted
      }
    } catch {}
    log.warn('localizeMessage: missing params or unformattable message; using fallback', {
      locale,
      id: value,
      paramKeys: Object.keys(values),
    })
    try {
      const generic = intl.formatMessage({ id: LOCALIZE_FALLBACK_ID })
      if (typeof generic === 'string' && generic !== LOCALIZE_FALLBACK_ID) {
        return generic
      }
    } catch {}
    return LOCALIZE_FALLBACK_TEXT
  }
  return { locale, t, tRich, localizeMessage }
}
