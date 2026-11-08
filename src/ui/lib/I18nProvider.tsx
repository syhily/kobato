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

/**
 * Params for `localizeMessage` — the scalar set a validation issue or an
 * error descriptor carries (Zod `too_small`/`too_big` numeric bounds AND the
 * explicit `params` bag of a custom issue: `{ label }`, `{ limit }` …).
 * `boolean` is here because the wire's `ErrorMessageParams` allows it;
 * react-intl cannot format a boolean, so the seam stringifies it. `null` is an
 * explicit empty value (react-intl renders nothing); `undefined` means the
 * caller could not supply it and counts as a missing param.
 */
export type I18nPlainMessageParams = Record<string, string | number | boolean | null | undefined>

/** Generic validation copy a failed `localizeMessage` degrades to. */
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
  /** Format one UI message id; `params` fill the ICU placeholders. Plain string result. */
  t: (id: UiMessageId, params?: I18nMessageParams) => string
  /**
   * Rich-text form for messages with `<tag>…</tag>` placeholders (e.g. a link
   * inside a sentence). Returns a React node so the interpolation stays one
   * message per locale instead of concatenated fragments.
   */
  tRich: (id: UiMessageId, params: I18nMessageParams) => ReactNode
  /**
   * Translate a message-id STRING when it is a registered catalog key; return
   * any other string unchanged. The seam for values whose typing is lost at
   * runtime (Zod issue messages): raw ids never reach the UI, and Zod's own
   * default messages pass through. `params` fill an id's placeholders — the
   * shared validation schemas attach `{min}` / `{max}` bounds that way, and a
   * custom issue's `params` bag (`{label}`) travels through the same channel.
   *
   * Formatting always goes through react-intl. A missing param or an
   * unformattable template logs and degrades to a generic localized validation
   * sentence — never a token name, the raw ICU template, or the message id.
   */
  localizeMessage: (value: string, params?: I18nPlainMessageParams) => string
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
  const localizeMessage = (value: string, params?: I18nPlainMessageParams): string => {
    // react-intl types `messages` as raw strings or pre-parsed ASTs depending on the
    // provider; we only ever feed it string catalogs, so narrow structurally.
    const messages: Record<string, unknown> = intl.messages
    const candidate = Object.hasOwn(messages, value) ? messages[value] : undefined
    if (typeof candidate !== 'string') {
      return value
    }
    // No braces at all: nothing to interpolate and nothing to leak — skip the
    // ICU parse (most validation messages are static sentences).
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
