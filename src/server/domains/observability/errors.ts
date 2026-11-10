// OpenObserve failure → typed error descriptor. The O2 client keeps only a
// closed kind/operation/status; this module is the single place that decides
// which admin-readable message the transport localizes.

import type { DomainErrorCode } from '@/server/infra/http/errors'
import type { ErrorMessageDescriptor } from '@/shared/contracts/api-error'

import { O2ClientError } from '@/server/domains/observability/o2-client'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'

export interface O2Failure {
  code: DomainErrorCode
  descriptor: ErrorMessageDescriptor
}

/** Map a safe O2 failure to a domain code + descriptor. Never includes the endpoint or credentials. */
export function o2Failure(error: O2ClientError, organization: string): O2Failure {
  // Organization creation through ingestion is root-only and can be disabled
  // by the O2 deployment; say that explicitly instead of a generic 401/404.
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

/** Throw a localized-at-the-boundary `DomainError` for an O2 failure; pass any other error through. */
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
