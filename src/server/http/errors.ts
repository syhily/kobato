import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import type { Env } from '@/server/http/context'
import type { RequestContext } from '@/server/http/request-context'
import type { DomainErrorIssue } from '@/server/infra/http/errors'
import type { ServerTranslator } from '@/server/infra/i18n'
import type { ErrorMessageParams } from '@/shared/contracts/api-error'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

import { carriesErrorMessageDescriptor } from '@/server/http/localized-http-exception'
import {
  apiErrorData,
  codeForStatus,
  summarizeApiError,
  translateApiError,
  translateDomainError,
  type TranslatedDomainError,
} from '@/server/http/translate-domain-error'
import { descriptorFor, zodIssuesToWire } from '@/server/infra/http/error-descriptor'
import { ActionFailure, DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { createServerTranslator } from '@/server/infra/i18n'
import { getLogger } from '@/server/infra/logger'
import { DEFAULT_LOCALE } from '@/shared/i18n/locales'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('http.error')

type HttpStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500

/**
 * The request's locale when the perimeter already derived it. Early
 * short-circuits (trailing-slash 301/404, install gate) can throw before
 * `requestContextMiddleware`, so the site default is the honest fallback.
 */
function requestTranslator(c: Context<Env>): ServerTranslator {
  // The early-error case may see no context at all; a hand-built test context
  // may predate `localization`. Both fall back to the pre-i18n site default.
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

/**
 * The JSON error body for responder-style middleware (`onError` hooks, the
 * install gate) that returns a Response instead of throwing. Same shape and
 * localization as the thrown path.
 */
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

/**
 * JSON body for a caught `ActionFailure`/`DomainError` in a resource route that
 * needs its own status decision (410 vs 400). Same localized shape as the
 * thrown path.
 */
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
    // Perimeter middlewares throw `LocalizedHttpException`; everything else
    // (third-party throws, custom responses) keeps its raw message.
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
          issues: zodIssuesToWire(err.issues),
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
