// System-notification i18n descriptor (plan 001, 5b-ii).
//
// A SYSTEM notification persists an English fallback in `title`/`body` plus a
// nullable descriptor (`titleKey`/`titleParams`, `bodyKey`/`bodyParams`). Read
// paths translate the descriptor with the reader's locale; a missing or
// malformed descriptor falls back to the stored English text with ONE warning
// per key per process. User-authored kinds (direct/broadcast) never carry a
// descriptor and keep their original text.
//
// `notification.*` keys are append-only: a row may outlive the code that wrote
// it, so a renamed/deleted key is treated exactly like a missing one.

import type { NotificationRow } from '@/server/infra/db/types'
import type { MessageParams, ServerTranslator } from '@/server/infra/i18n'
import type { ServerMessageId } from '@/shared/i18n/messages/server/en-US'

import { createServerTranslator, isServerMessageId } from '@/server/infra/i18n'
import { getLogger } from '@/server/infra/logger'
import { BASE_LOCALE } from '@/shared/i18n/locales'
import { isRecord } from '@/shared/utils/type-guards'

const log = getLogger('notifications.message')

/** Every persisted `notification.*` key starts with this prefix (append-only namespace). */
export const NOTIFICATION_KEY_PREFIX = 'notification.'

/** JSON-serializable ICU argument values — no HTML, no non-finite numbers. */
export type NotificationParamValue =
  | string
  | number
  | boolean
  | null
  | NotificationParamValue[]
  | { [key: string]: NotificationParamValue }

export type NotificationParams = Record<string, NotificationParamValue>

/** Producer-facing shape: typed keys + params, no prose. */
export interface NotificationDescriptor {
  titleKey: ServerMessageId
  titleParams?: NotificationParams
  bodyKey: ServerMessageId
  bodyParams?: NotificationParams
}

export interface SystemNotificationMessage extends NotificationDescriptor {
  source?: string | null
  actionUrl?: string | null
}

/** The persisted half of a system notification (English fallback + encoded params). */
export interface EncodedNotificationDescriptor {
  title: string
  body: string
  titleKey: ServerMessageId
  titleParams: string | null
  bodyKey: ServerMessageId
  bodyParams: string | null
}

/** Raw HTML in a persisted param would be a producer bug — the reader renders plain text. */
const HTML_MARKUP = /<[a-zA-Z!/?]/

/**
 * ICU only consumes scalar arguments; nested stored params are inert at
 * format time. Narrowing here (instead of casting) keeps the formatter's
 * contract honest.
 */
function toMessageParams(params: Record<string, unknown> | undefined): MessageParams | undefined {
  if (params === undefined) {
    return undefined
  }
  const scalar: MessageParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      scalar[key] = value
    }
  }
  return scalar
}

function assertParamValue(value: unknown, path: string): void {
  if (value === null || typeof value === 'boolean') {
    return
  }
  if (typeof value === 'string') {
    if (HTML_MARKUP.test(value)) {
      throw new TypeError(`Notification param ${path} must not contain HTML markup`)
    }
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Notification param ${path} must be a finite number`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertParamValue(entry, `${path}[${index}]`))
    return
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertParamValue(entry, `${path}.${key}`)
    }
    return
  }
  throw new Error(`Notification param ${path} is not JSON-serializable`)
}

/** Throw on an unregistered/wrong-namespace key or unsafe params (producer bugs, never user input). */
function assertNotificationKey(key: string, field: string): asserts key is ServerMessageId {
  if (!isServerMessageId(key)) {
    throw new Error(`Notification ${field} key is not registered in the server catalog: ${key}`)
  }
  if (!key.startsWith(NOTIFICATION_KEY_PREFIX)) {
    throw new Error(`Notification ${field} key must use the ${NOTIFICATION_KEY_PREFIX} namespace: ${key}`)
  }
}

function encodeParams(params: NotificationParams | undefined, field: string): string | null {
  if (params === undefined) {
    return null
  }
  assertParamValue(params, field)
  const encoded = JSON.stringify(params)
  // Defensive: a round-trip proves serializability (and never stores `undefined`).
  if (typeof encoded !== 'string') {
    throw new TypeError(`Notification ${field} params are not serializable`)
  }
  return encoded
}

/**
 * Validate a producer's descriptor and compute the English fallback persisted
 * with the row. The fallback is what logs, old clients and a missing-key read
 * see — the same sentence the English translator would render.
 */
export function encodeNotificationDescriptor(message: NotificationDescriptor): EncodedNotificationDescriptor {
  assertNotificationKey(message.titleKey, 'title')
  assertNotificationKey(message.bodyKey, 'body')
  const titleParams = encodeParams(message.titleParams, 'title')
  const bodyParams = encodeParams(message.bodyParams, 'body')
  const english = createServerTranslator(BASE_LOCALE)
  return {
    title: english.format(message.titleKey, toMessageParams(message.titleParams)),
    body: english.format(message.bodyKey, toMessageParams(message.bodyParams)),
    titleKey: message.titleKey,
    titleParams,
    bodyKey: message.bodyKey,
    bodyParams,
  }
}

// One warning per key per process: a renamed/deleted key must not spam the log
// on every inbox read.
const warnedKeys = new Set<string>()

function warnOnce(key: string, reason: string): void {
  if (warnedKeys.has(key)) {
    return
  }
  warnedKeys.add(key)
  log.warn('notification descriptor could not be translated; using the stored fallback', { key, reason })
}

/** Test seam: the warning cache is process-wide. */
export function __resetNotificationMessageWarningsForTests(): void {
  warnedKeys.clear()
}

function resolveField(field: 'title' | 'body', row: NotificationRow, t: ServerTranslator): string {
  const key = field === 'title' ? row.titleKey : row.bodyKey
  const paramsJson = field === 'title' ? row.titleParams : row.bodyParams
  const stored = field === 'title' ? row.title : row.body
  if (key === null) {
    return stored
  }
  if (!isServerMessageId(key)) {
    warnOnce(key, 'unregistered-key')
    return stored
  }
  let params: Record<string, unknown> | undefined
  if (paramsJson !== null) {
    try {
      const parsed: unknown = JSON.parse(paramsJson)
      if (!isRecord(parsed)) {
        warnOnce(key, 'invalid-params')
        return stored
      }
      params = parsed
    } catch {
      warnOnce(key, 'invalid-params')
      return stored
    }
  }
  try {
    return t.format(key, toMessageParams(params))
  } catch {
    warnOnce(key, 'format-failed')
    return stored
  }
}

export interface ResolvedNotificationMessage {
  title: string
  body: string
}

/**
 * Translate a notification row for one reader locale. The FULL result feeds
 * both the detail view and (truncated) the inbox preview, so the two can never
 * disagree. Rows without a descriptor return their stored text unchanged.
 */
export function resolveNotificationMessage(row: NotificationRow, t: ServerTranslator): ResolvedNotificationMessage {
  return {
    title: resolveField('title', row, t),
    body: resolveField('body', row, t),
  }
}
