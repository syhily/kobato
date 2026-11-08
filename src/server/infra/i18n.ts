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

import type { ReactNode } from 'react'

import { createIntl, createIntlCache } from 'react-intl'

import type { AppLocale } from '@/shared/i18n/locales'
import type { ServerMessageId, ServerMessages } from '@/shared/i18n/messages/server/en-US'
import type { UiMessageId, UiMessages } from '@/shared/i18n/messages/ui/en-US'

import { NODE_ENV } from '@/server/infra/config'
import { getLogger } from '@/server/infra/logger'
import { assertCatalogsValid, serverMessagesFor, uiMessagesFor } from '@/shared/i18n/catalog'
import { BASE_LOCALE } from '@/shared/i18n/locales'
import { serverMessagesEnUS } from '@/shared/i18n/messages/server/en-US'

const log = getLogger('i18n')

/** Runtime membership test against the SERVER catalog (email / notification keys). */
export function isServerMessageId(value: string): value is ServerMessageId {
  return Object.hasOwn(serverMessagesEnUS, value)
}

/** Every message id a server surface may format (UI catalog + server catalog). */
export type MessageId = UiMessageId | ServerMessageId

export type MessageParams = Record<string, string | number | boolean | Date | null | undefined>

/** Renders one rich-text tag's chunks — a rich message's `<tag>…</tag>` placeholder. */
export type RichTextTag = (chunks: ReactNode[]) => ReactNode

/** ICU values for a rich message: plain interpolation values plus tag renderers. */
export type RichMessageParams = Record<string, string | number | boolean | Date | null | undefined | RichTextTag>

type MergedMessages = UiMessages & ServerMessages

export interface ServerTranslator {
  /** The locale actually formatted against (English when the catalogs failed validation). */
  readonly locale: AppLocale
  readonly messages: MergedMessages
  format(id: MessageId, params?: MessageParams): string
  /**
   * Format a message that contains `<tag>…</tag>` placeholders. The caller
   * supplies one renderer per tag name, so a single translated sentence can
   * embed a link (e.g. the email footer's site-name link) without concatenating
   * translated fragments in JSX.
   */
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
      // react-intl turns the tag functions into React nodes (`toKeyedReactNodeArray`).
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
      // The catalog types make this unreachable; a dynamic legacy key that
      // still arrives here is a bug worth stopping in dev and test.
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
