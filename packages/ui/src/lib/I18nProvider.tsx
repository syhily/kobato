import type { AppLocale } from '@kobato/i18n/locales.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { ReactNode } from 'react'

import { getLogger } from '@kobato/ui/lib/logger.ts'
import { createContext, useCallback, useContext } from 'react'
import { IntlContext, IntlProvider } from 'react-intl'

const log = getLogger('i18n')

/**
 * ICU values accepted by react-intl, including the rich-text form (`<link>{title}</link>` —
 * a function receiving the tag's chunks). Never build sentences by concatenating fragments.
 */
export type I18nMessageParams = Record<
  string,
  string | number | Date | null | undefined | ReactNode | ((chunks: ReactNode[]) => ReactNode)
>

/**
 * Scalar params for `localizeMessage`. `boolean` arrives over the wire and is stringified here
 * (react-intl cannot format it); `null` is an explicit empty value, `undefined` counts as missing.
 */
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
  /** Rich-text form: one message per locale holds the whole sentence, tag included. */
  tRich: (id: UiMessageId, params: I18nMessageParams) => ReactNode
  /**
   * Translate a message-id string when it is a registered catalog key; return any other string
   * unchanged, so Zod's own default messages pass through and raw ids never reach the UI. A
   * missing param or unformattable template logs and degrades to a generic localized sentence.
   */
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
      // Plain messages never carry rich tags, so react-intl returns a string.
      return typeof formatted === 'string' ? formatted : ''
    },
    [intl],
  )
  const tRich = useCallback<I18nValue['tRich']>((id, params) => intl.formatMessage({ id }, params) as ReactNode, [intl])
  if (locale === null) {
    throw new Error('useI18n() requires the root <I18nProvider> (see src/root.tsx).')
  }
  const localizeMessage = (value: string, params?: I18nPlainMessageParams): string => {
    // react-intl types `messages` as raw strings or pre-parsed ASTs depending on the
    // provider; only string catalogs are fed here, so narrow structurally.
    const messages: Record<string, unknown> = intl.messages
    const candidate = Object.hasOwn(messages, value) ? messages[value] : undefined
    if (typeof candidate !== 'string') {
      return value
    }
    if (!candidate.includes('{')) {
      return candidate
    }
    const values = toIcuValues(params)
    // react-intl is the ONE formatter; missing params make it report an error
    // and answer the raw template (or the id), which must never reach the UI.
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
