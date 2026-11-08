// An `HTTPException` whose user-facing copy is a typed descriptor. The Hono
// perimeter (`onErrorHandler`) translates it for the request locale; the
// perimeter middlewares use it because they have no `DomainError` channel.

import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { HTTPException } from 'hono/http-exception'

import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { descriptorFor } from '@/server/infra/http/error-descriptor'

export class LocalizedHttpException extends HTTPException {
  readonly descriptor: ErrorMessageDescriptor

  constructor(status: ContentfulStatusCode, descriptor: ErrorMessageDescriptor) {
    super(status, { message: descriptor.fallbackMessage })
    this.descriptor = descriptor
  }
}

/** Convenience factory: status + catalog key → a translatable exception. */
export function localizedHttpException(status: ContentfulStatusCode, messageKey: UiMessageId): LocalizedHttpException {
  return new LocalizedHttpException(status, descriptorFor(messageKey))
}
