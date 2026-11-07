// The server-side translator: the same ICU engine the client uses
// (react-intl's `createIntl`), formatting the merged UI + server catalog for
// one locale. Background jobs, email and notification producers resolve their
// locale explicitly through `createServerTranslator` — no module-level
// "current locale" state lives here; the only state is the immutable
// locale-keyed cache below.
//
// Catalog validation is checked once per process, and a failure degrades to
// the English catalogs with an error log: `shared/` cannot log, so this
// boundary owns the catch.

import { createIntl, createIntlCache } from 'react-intl'

import type { AppLocale } from '@/shared/i18n/locales'
import type { ServerMessageId, ServerMessages } from '@/shared/i18n/messages/server/en-US'
import type { UiMessageId, UiMessages } from '@/shared/i18n/messages/ui/en-US'

import { NODE_ENV } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'
import { assertCatalogsValid, serverMessagesFor, uiMessagesFor } from '@/shared/i18n/catalog'
import { BASE_LOCALE } from '@/shared/i18n/locales'

const log = getLogger('i18n')

/** Every message id a server surface may format (UI catalog + server catalog). */
export type MessageId = UiMessageId | ServerMessageId

export type MessageParams = Record<string, string | number | boolean | Date | null | undefined>

type MergedMessages = UiMessages & ServerMessages

export interface ServerTranslator {
  /** The locale actually formatted against (English when the catalogs failed validation). */
  readonly locale: AppLocale
  readonly messages: MergedMessages
  format(id: MessageId, params?: MessageParams): string
}

const intlCache = createIntlCache()
const translators = new Map<AppLocale, ServerTranslator>()
let catalogsVerified = false

function catalogsAreValid(): boolean {
  if (catalogsVerified) {
    return true
  }
  try {
    assertCatalogsValid()
    catalogsVerified = true
    return true
  } catch (error) {
    log.error('i18n catalogs failed validation; degrading to English', { error })
    return false
  }
}

function mergeMessages(locale: AppLocale): MergedMessages {
  return { ...uiMessagesFor(locale), ...serverMessagesFor(locale) }
}

export function createServerTranslator(locale: AppLocale): ServerTranslator {
  const cached = translators.get(locale)
  if (cached !== undefined) {
    return cached
  }

  const resolvedLocale: AppLocale = catalogsAreValid() ? locale : BASE_LOCALE
  const messages = mergeMessages(resolvedLocale)
  const intl = createIntl(
    {
      locale: resolvedLocale,
      messages,
      onError: (error) => log.warn('i18n format failure', { locale: resolvedLocale, error: error.message }),
    },
    intlCache,
  )

  const translator: ServerTranslator = {
    locale: resolvedLocale,
    messages,
    format(id, params) {
      const message = messages[id]
      if (message === undefined) {
        // The catalog types make this unreachable; a dynamic legacy key that
        // still arrives here is a bug worth stopping in dev and test.
        if (NODE_ENV !== 'production') {
          throw new Error(`Unknown i18n message id: ${id}`)
        }
        log.warn('Unknown i18n message id', { locale: resolvedLocale, id })
        return id
      }
      return intl.formatMessage({ id, defaultMessage: message }, params)
    },
  }

  translators.set(locale, translator)
  return translator
}
