import type { Context } from 'hono'

import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'

import type { Env } from '@/server/http/context'

import { ActionFailure, DomainError, domainStatus, ErrorMessages } from '@/server/infra/http/errors'
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

  if (err instanceof ActionFailure) {
    if (err.headers) {
      const h = new Headers(err.headers)
      h.forEach((v, k) => c.header(k, v, { append: true }))
    }
    c.header('X-Request-Id', requestId)
    return c.json(
      {
        error: {
          message: err.message,
          issues: err.issues,
        },
      },
      unsafeCast<400 | 401 | 403 | 404 | 409 | 413 | 429 | 500>(err.status),
    )
  }

  if (err instanceof DomainError) {
    c.header('X-Request-Id', requestId)
    return c.json(
      { error: { message: err.message, issues: err.issues } },
      unsafeCast<400 | 401 | 403 | 404 | 409 | 429 | 500>(domainStatus(err)),
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
