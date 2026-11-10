import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'
import type { DomainErrorIssue } from '@/server/infra/http/errors'
import type { ServerTranslator } from '@/server/infra/i18n'
import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import {
  apiErrorData,
  codeForStatus,
  summarizeApiError,
  translateApiError,
  translateDomainError,
  type TranslatedDomainError,
} from '@/server/http/translate-domain-error'
import { carriesErrorMessageDescriptor, descriptorFor, zodIssuesToWire } from '@/server/infra/http/error-descriptor'
import { ActionFailure, DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'
import { getLogger } from '@/server/infra/logger'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('http.error')

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500

// Early short-circuits (trailing-slash, install gate) can throw before the
// request context exists; the site default locale is then the honest fallback.
function requestTranslator(c: Context<Env>): ServerTranslator {
  const rc = c.var.requestContext as Partial<RequestContext> | undefined
  return createServerTranslator(rc?.localization?.locale ?? DEFAULT_LOCALE)
}

function respond(
  c: Context<Env>,
  status: number,
  translated: TranslatedDomainError,
  translator: ServerTranslator,
): Response {
  c.header('X-Request-Id', c.var.requestId)
  return c.json(
    {
      error: {
        code: translated.code,
        message: summarizeApiError(translated, translator),
        ...apiErrorData(translated),
      },
    },
    unsafeCast<HttpStatus>(status),
  )
}

/** `HTTPException` carries arbitrary causes; only `[{ message, path? }]` shapes are issues. */
function causeIssues(cause: unknown): DomainErrorIssue[] | undefined {
  if (!Array.isArray(cause)) {
    return undefined
  }
  const items: unknown[] = cause
  const issues: DomainErrorIssue[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null || !('message' in item) || typeof item.message !== 'string') {
      issues.push({ message: String(item) })
      continue
    }
    const path = 'path' in item && Array.isArray(item.path) ? item.path.map(String) : undefined
    issues.push({ message: item.message, ...(path === undefined ? {} : { path }) })
  }
  return issues.length === 0 ? undefined : issues
}

/** Responder-style JSON error body (onError hooks, install gate): same shape and localization as the thrown path. */
export function errorJsonResponse(
  c: Context<Env>,
  status: number,
  messageKey: UiMessageId,
  params?: ErrorMessageParams,
): Response {
  const descriptor = descriptorFor(messageKey, params)
  const translator = requestTranslator(c)
  c.header('X-Request-Id', c.var.requestId)
  return c.json(
    {
      error: {
        code: codeForStatus(status),
        message: translator.format(descriptor.messageKey, descriptor.params),
        descriptor,
      },
    },
    unsafeCast<HttpStatus>(status),
  )
}

/** JSON body for a caught failure in a resource route choosing its own status (410 vs 400). */
export function failureJsonResponse(c: Context<Env>, error: ActionFailure | DomainError, status?: number): Response {
  const translator = requestTranslator(c)
  const translated = translateDomainError(error, translator)
  if (translated.headers) {
    const headers = new Headers(translated.headers)
    headers.forEach((value, key) => c.header(key, value, { append: true }))
  }
  return respond(c, status ?? translated.status, translated, translator)
}

export function onErrorHandler(err: Error, c: Context<Env>): Response {
  const requestId = c.var.requestId
  const translator = requestTranslator(c)

  if (err instanceof HTTPException) {
    // Perimeter middlewares throw `LocalizedHttpException`; third-party throws keep their raw message.
    return respond(
      c,
      err.status,
      translateApiError(
        {
          status: err.status,
          code: codeForStatus(err.status),
          message: carriesErrorMessageDescriptor(err) ? err.descriptor : err.message,
          issues: causeIssues(err.cause),
        },
        translator,
      ),
      translator,
    )
  }

  if (err instanceof ActionFailure || err instanceof DomainError) {
    const translated = translateDomainError(err, translator)
    if (translated.headers) {
      const headers = new Headers(translated.headers)
      headers.forEach((value, key) => c.header(key, value, { append: true }))
    }
    return respond(c, translated.status, translated, translator)
  }

  if (err instanceof ZodError) {
    return respond(
      c,
      400,
      translateApiError(
        {
          status: 400,
          code: 'BAD_REQUEST',
          message: ErrorMessages.INVALID_INPUT,
          issues: zodIssuesToWire(err.issues, translator),
        },
        translator,
      ),
      translator,
    )
  }

  log.error('unexpected', { requestId, error: err })
  return respond(
    c,
    500,
    translateApiError(
      { status: 500, code: 'INTERNAL_SERVER_ERROR', message: ErrorMessages.INTERNAL_SERVER_ERROR },
      translator,
    ),
    translator,
  )
}
