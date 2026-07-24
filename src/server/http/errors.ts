import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import type { Env } from '@/server/http/context'

import { translateDomainError } from '@/server/http/translate-domain-error'
import { ActionFailure, DomainError, ErrorMessages } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('http.error')

export function onErrorHandler(err: Error, c: Context<Env>): Response {
  const requestId = c.var.requestId

  if (err instanceof HTTPException) {
    c.header('X-Request-Id', requestId)
    return c.json(
      {
        error: {
          message: err.message,
          issues: unsafeCast<{ message: string; path?: string[] }[] | undefined>(err.cause),
        },
      },
      unsafeCast<400 | 401 | 403 | 404 | 409 | 413 | 429 | 500>(err.status),
    )
  }

  if (err instanceof ActionFailure || err instanceof DomainError) {
    const translated = translateDomainError(err)
    if (translated.headers) {
      const h = new Headers(translated.headers)
      h.forEach((v, k) => c.header(k, v, { append: true }))
    }
    c.header('X-Request-Id', requestId)
    return c.json(
      {
        error: {
          message: translated.message,
          issues: translated.issues,
        },
      },
      unsafeCast<400 | 401 | 403 | 404 | 409 | 413 | 429 | 500>(translated.status),
    )
  }

  if (err instanceof ZodError) {
    c.header('X-Request-Id', requestId)
    return c.json(
      {
        error: {
          message: ErrorMessages.INVALID_INPUT,
          issues: err.issues.map((i) => ({ message: i.message, path: i.path.map(String) })),
        },
      },
      400,
    )
  }

  log.error('unexpected', { requestId, error: err })
  c.header('X-Request-Id', requestId)
  return c.json({ error: { message: ErrorMessages.INTERNAL_SERVER_ERROR } }, 500)
}
