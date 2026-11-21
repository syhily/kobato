import type { AppLocale } from '@kobato/i18n/locales'
import type { ServerMessageId, ServerMessages } from '@kobato/i18n/messages/server/en-US'
import type { UiMessageId, UiMessages } from '@kobato/i18n/messages/ui/en-US'
import type { ReactNode } from 'react'

import { assertCatalogsValid, serverMessagesFor, uiMessagesFor } from '@kobato/i18n/catalog'
import { BASE_LOCALE } from '@kobato/i18n/locales'
import { serverMessagesEnUS } from '@kobato/i18n/messages/server/en-US'
import { NODE_ENV } from '@kobato/server/infra/config'
import { getLogger } from '@kobato/server/infra/logger'
import { createIntl, createIntlCache } from 'react-intl'

const log = getLogger('i18n')

export function isServerMessageId(value: string): value is ServerMessageId {
  return Object.hasOwn(serverMessagesEnUS, value)
}

export type MessageId = UiMessageId | ServerMessageId

export type MessageParams = Record<string, string | number | boolean | Date | null | undefined>

export type RichTextTag = (chunks: ReactNode[]) => ReactNode

export type RichMessageParams = Record<string, string | number | boolean | Date | null | undefined | RichTextTag>

type MergedMessages = UiMessages & ServerMessages

export interface ServerTranslator {
  readonly locale: AppLocale
  readonly messages: MergedMessages
  format(id: MessageId, params?: MessageParams): string
  formatRich(id: MessageId, params?: RichMessageParams): ReactNode
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
      return intl.formatMessage({ id, defaultMessage: requireMessage(id) }, params)
    },
    formatRich(id, params) {
      const message = requireMessage(id)
      const formatted = intl.formatMessage(
        { id, defaultMessage: message },
        params as Parameters<typeof intl.formatMessage>[1],
      )
      return formatted as ReactNode
    },
  }

  function requireMessage(id: MessageId): string {
    const message = messages[id]
    if (message === undefined) {
      if (NODE_ENV !== 'production') {
        throw new Error(`Unknown i18n message id: ${id}`)
      }
      log.warn('Unknown i18n message id', { locale: resolvedLocale, id })
      return id
    }
    return message
  }

  translators.set(locale, translator)
  return translator
}
