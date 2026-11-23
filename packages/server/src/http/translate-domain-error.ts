import type { ApiErrorData, ErrorIssueWire, ErrorMessageDescriptor } from '@kobato/api/contracts/primitives'
import type { ServerTranslator } from '@kobato/server/infra/i18n'

import { descriptorMessage, rawMessageDescriptor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure, DomainError, domainStatus, type DomainErrorIssue } from '@kobato/server/infra/http/errors'

export interface TranslatedDomainError {
  status: number
  code: string
  message: string
  descriptor: ErrorMessageDescriptor
  issues?: ErrorIssueWire[]
  headers?: HeadersInit
}

export interface ApiErrorInput {
  status: number
  code: string
  message: string | ErrorMessageDescriptor
  issues?: DomainErrorIssue[]
  headers?: HeadersInit
}

function issueToWire(issue: DomainErrorIssue, translator?: ServerTranslator): ErrorIssueWire {
  const descriptor: ErrorMessageDescriptor = 'messageKey' in issue ? issue : rawMessageDescriptor(issue.message)
  return {
    messageKey: descriptor.messageKey,
    ...(descriptor.params === undefined ? {} : { params: descriptor.params }),
    fallbackMessage: descriptor.fallbackMessage,
    message: descriptorMessage(descriptor, translator),
    ...(issue.code === undefined ? {} : { code: issue.code }),
    ...(issue.path === undefined ? {} : { path: issue.path }),
  }
}

export function translateApiError(input: ApiErrorInput, translator?: ServerTranslator): TranslatedDomainError {
  const descriptor = typeof input.message === 'string' ? rawMessageDescriptor(input.message) : input.message
  const message = descriptorMessage(descriptor, translator)
  const issues = input.issues?.map((issue) => issueToWire(issue, translator))
  return {
    status: input.status,
    code: input.code,
    message,
    descriptor,
    ...(issues === undefined ? {} : { issues }),
    ...(input.headers === undefined ? {} : { headers: input.headers }),
  }
}

export function translateDomainError(
  error: DomainError | ActionFailure,
  translator?: ServerTranslator,
): TranslatedDomainError {
  return translateApiError(
    {
      status: error instanceof ActionFailure ? error.status : domainStatus(error),
      code: error instanceof DomainError ? error.code : 'INTERNAL_SERVER_ERROR',
      message: error.descriptor ?? error.message,
      issues: error.issues,
      headers: error instanceof ActionFailure ? error.headers : undefined,
    },
    translator,
  )
}

export function summarizeApiError(translated: TranslatedDomainError, translator: ServerTranslator): string {
  const { issues } = translated
  if (issues === undefined || issues.length === 0) {
    return translated.message
  }
  const separator = translator.format('error.api.issueSeparator')
  const parts = issues.map((issue) => {
    const text = issue.message
    const path = issue.path?.join('.')
    return path === undefined || path === ''
      ? text
      : translator.format('error.api.issueWithPath', { path, message: text })
  })
  return translator.format('error.api.summary', { message: translated.message, issues: parts.join(separator) })
}

export function formatWarningDescriptors(
  descriptors: readonly ErrorMessageDescriptor[],
  translator: ServerTranslator,
): string | undefined {
  if (descriptors.length === 0) {
    return undefined
  }
  return descriptors.map((descriptor) => translator.format(descriptor.messageKey, descriptor.params)).join(' ')
}

export function apiErrorData(translated: TranslatedDomainError): ApiErrorData {
  return {
    descriptor: translated.descriptor,
    ...(translated.issues === undefined ? {} : { issues: translated.issues }),
  }
}

export function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 422:
      return 'UNPROCESSABLE_CONTENT'
    case 429:
      return 'TOO_MANY_REQUESTS'
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST'
  }
}
