import type { AppLocale } from '@kobato/i18n/locales'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

import { createIntl, createIntlCache, type IntlShape } from '@formatjs/intl'

export type UiMessageTable = Readonly<Record<string, string>>

export type UiMessageValues = Record<string, string | number | boolean | null>

const cache = createIntlCache()
const resolved = new Map<AppLocale, { messages: UiMessageTable; intl: IntlShape }>()

function intlFor(locale: AppLocale, messages: UiMessageTable): IntlShape {
  const found = resolved.get(locale)
  if (found?.messages === messages) {
    return found.intl
  }
  const intl = createIntl({ locale, messages, onError: () => undefined }, cache)
  resolved.set(locale, { messages, intl })
  return intl
}

function toText(formatted: unknown): string {
  if (typeof formatted === 'string') {
    return formatted
  }
  if (Array.isArray(formatted)) {
    const parts: unknown[] = formatted
    return parts
      .filter((part): part is string | number => typeof part === 'string' || typeof part === 'number')
      .join('')
  }
  return ''
}

export function formatUiMessage(
  locale: AppLocale,
  messages: UiMessageTable,
  id: UiMessageId,
  values?: UiMessageValues,
): string {
  const fallback = Object.hasOwn(messages, id) ? messages[id] : id
  return toText(intlFor(locale, messages).formatMessage({ id, defaultMessage: fallback }, values))
}
