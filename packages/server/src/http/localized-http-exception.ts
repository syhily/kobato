// An `HTTPException` whose copy is a typed descriptor: the Hono perimeter translates it
// for the request locale, which the perimeter middlewares need (no `DomainError` channel).

import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error.ts'
import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US.ts'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { descriptorFor } from '@kobato/server/infra/http/error-descriptor.ts'
import { HTTPException } from 'hono/http-exception'

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
