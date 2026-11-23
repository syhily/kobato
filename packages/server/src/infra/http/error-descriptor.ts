import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'
import type { ServerTranslator } from '@kobato/server/infra/i18n'
import type { z } from 'zod'

import {
  type ErrorIssueWire,
  type ErrorMessageDescriptor,
  type ErrorMessageParams,
  zodIssueParams,
} from '@kobato/api/contracts/primitives'
import { BASE_LOCALE } from '@kobato/i18n/locales'
import { uiMessagesEnUS } from '@kobato/i18n/messages/ui/en-US'
import { createServerTranslator } from '@kobato/server/infra/i18n'

export const RAW_MESSAGE_KEY = 'error.api.rawMessage'

export function isUiMessageId(value: string): value is UiMessageId {
  return Object.hasOwn(uiMessagesEnUS, value)
}

export function carriesErrorMessageDescriptor(value: unknown): value is { descriptor: ErrorMessageDescriptor } {
  if (typeof value !== 'object' || value === null || !('descriptor' in value)) {
    return false
  }
  const descriptor: unknown = value.descriptor
  return (
    typeof descriptor === 'object' &&
    descriptor !== null &&
    'messageKey' in descriptor &&
    typeof descriptor.messageKey === 'string'
  )
}

export function rawMessageDescriptor(message: string): ErrorMessageDescriptor {
  return { messageKey: RAW_MESSAGE_KEY, params: { message }, fallbackMessage: message }
}

export function descriptorFor(messageKey: UiMessageId, params?: ErrorMessageParams): ErrorMessageDescriptor {
  return {
    messageKey,
    ...(params === undefined ? {} : { params }),
    fallbackMessage: createServerTranslator(BASE_LOCALE).format(messageKey, params),
  }
}

export function messageDescriptor(message: string, params?: ErrorMessageParams): ErrorMessageDescriptor {
  return isUiMessageId(message) ? descriptorFor(message, params) : rawMessageDescriptor(message)
}

export function descriptorMessage(descriptor: ErrorMessageDescriptor, translator?: ServerTranslator): string {
  if (translator === undefined || !Object.hasOwn(translator.messages, descriptor.messageKey)) {
    return descriptor.fallbackMessage
  }
  return translator.format(descriptor.messageKey, descriptor.params)
}

export function zodIssueToWire(issue: z.core.$ZodIssue, translator?: ServerTranslator): ErrorIssueWire {
  const path = issue.path.map(String)
  const descriptor = messageDescriptor(issue.message, zodIssueParams(issue))
  return {
    ...descriptor,
    message: descriptorMessage(descriptor, translator),
    code: issue.code,
    ...(path.length === 0 ? {} : { path }),
  }
}

export function zodIssuesToWire(issues: readonly z.core.$ZodIssue[], translator?: ServerTranslator): ErrorIssueWire[] {
  return issues.map((issue) => zodIssueToWire(issue, translator))
}
