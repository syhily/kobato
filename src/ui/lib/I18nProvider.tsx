// react-intl provider fed with the current locale's UI catalog from the root loader.
// Never value-import the catalogs here: messages arrive as props, so one locale, not
// four, reaches the browser. Pinned by tests/unit/arch/client-bundle.test.ts.

import type { ReactNode } from 'react'

import { createContext, useCallback, useContext } from 'react'
import { IntlContext, IntlProvider } from 'react-intl'

import type { AppLocale } from '@/shared/i18n/locales'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { getLogger } from '@/client/lib/logger'

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
/** Last resort when even the generic catalog entry is absent (no English map on the client). */
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

/** A full `UiMessages` map, or the minimal `FallbackMessages` when the root loader failed. */
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

/** Requires the root `<I18nProvider>`; throwing keeps a missing provider a loud test failure. */
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
    // No braces: skip the ICU parse (most validation messages are static sentences).
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
    } catch {
      // Formatting threw instead of reporting through onError — same fallback.
    }
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
    } catch {
      // The provider may carry only the minimal FallbackMessages subset.
    }
    return LOCALIZE_FALLBACK_TEXT
  }
  return { locale, t, tRich, localizeMessage }
}
