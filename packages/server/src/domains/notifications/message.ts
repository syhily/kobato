import type { NotificationRow } from '@kobato/db/sqlite/types'
import type { ServerMessageId } from '@kobato/i18n/messages/server/en-US'
import type { MessageParams, ServerTranslator } from '@kobato/server/infra/i18n'

import { isRecord } from '@kobato/base/utils/type-guards'
import { BASE_LOCALE } from '@kobato/i18n/locales'
import { createServerTranslator, isServerMessageId } from '@kobato/server/infra/i18n'
import { getLogger } from '@kobato/server/infra/logger'

const log = getLogger('notifications.message')

export const NOTIFICATION_KEY_PREFIX = 'notification.'

export type NotificationParamValue =
  | string
  | number
  | boolean
  | null
  | NotificationParamValue[]
  | { [key: string]: NotificationParamValue }

export type NotificationParams = Record<string, NotificationParamValue>

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

export interface EncodedNotificationDescriptor {
  title: string
  body: string
  titleKey: ServerMessageId
  titleParams: string | null
  bodyKey: ServerMessageId
  bodyParams: string | null
}

function toMessageParams(params: Record<string, unknown> | undefined): MessageParams | undefined {
  if (params === undefined) {
    return undefined
  }
  const scalar: MessageParams = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      Object.defineProperty(scalar, key, { value, enumerable: true, configurable: true, writable: true })
    }
  }
  return scalar
}

function isPlainJsonObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertParamValue(value: unknown, path: string, seen: WeakSet<object>): void {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Notification param ${path} must be a finite number`)
    }
    return
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Notification param ${path} is not JSON-serializable`)
  }
  if (seen.has(value)) {
    throw new TypeError(`Notification param ${path} is not JSON-serializable (circular reference)`)
  }
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertParamValue(entry, `${path}[${index}]`, seen))
  } else if (isPlainJsonObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      assertParamValue(entry, `${path}.${key}`, seen)
    }
  } else {
    throw new TypeError(`Notification param ${path} is not a plain JSON object`)
  }
  seen.delete(value)
}

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
  assertParamValue(params, field, new WeakSet())
  const encoded = JSON.stringify(params)
  if (typeof encoded !== 'string') {
    throw new TypeError(`Notification ${field} params are not serializable`)
  }
  return encoded
}

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

const warnedKeys = new Set<string>()

function warnOnce(key: string, reason: string): void {
  if (warnedKeys.has(key)) {
    return
  }
  warnedKeys.add(key)
  log.warn('notification descriptor could not be translated; using the stored fallback', { key, reason })
}

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

export function resolveNotificationMessage(row: NotificationRow, t: ServerTranslator): ResolvedNotificationMessage {
  return {
    title: resolveField('title', row, t),
    body: resolveField('body', row, t),
  }
}
