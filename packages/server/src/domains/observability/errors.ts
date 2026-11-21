import type { ErrorMessageDescriptor } from '@kobato/contracts/api-error'
import type { DomainErrorCode } from '@kobato/server/infra/http/errors'

import { O2ClientError } from '@kobato/server/domains/observability/o2-client'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'

export interface O2Failure {
  code: DomainErrorCode
  descriptor: ErrorMessageDescriptor
}

export function o2Failure(error: O2ClientError, organization: string): O2Failure {
  if (error.operation === 'ensure-organization' && error.kind !== 'network' && error.kind !== 'timeout') {
    return {
      code: 'BAD_REQUEST',
      descriptor: descriptorFor('admin.settings.observability.error.organizationUnavailable', { organization }),
    }
  }
  switch (error.kind) {
    case 'config':
      return { code: 'BAD_REQUEST', descriptor: descriptorFor('admin.settings.observability.error.config') }
    case 'auth':
      return { code: 'BAD_REQUEST', descriptor: descriptorFor('admin.settings.observability.error.unauthorized') }
    case 'forbidden':
      return { code: 'BAD_REQUEST', descriptor: descriptorFor('admin.settings.observability.error.forbidden') }
    case 'network':
    case 'timeout':
      return { code: 'INTERNAL', descriptor: descriptorFor('admin.settings.observability.error.unreachable') }
    case 'not-found':
    case 'invalid-response':
      return { code: 'INTERNAL', descriptor: descriptorFor('admin.settings.observability.error.upstream') }
    case 'upstream':
      return {
        code: 'INTERNAL',
        descriptor: descriptorFor(
          error.operation === 'health'
            ? 'admin.settings.observability.error.health'
            : 'admin.settings.observability.error.upstream',
        ),
      }
  }
}

export function throwO2Failure(error: unknown, organization: string): never {
  if (error instanceof DomainError) {
    throw error
  }
  if (error instanceof O2ClientError) {
    const failure = o2Failure(error, organization)
    throw new DomainError(failure.code, failure.descriptor)
  }
  throw error
}
