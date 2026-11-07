import type { Context } from 'hono'
import type { BodyData } from 'hono/utils/body'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { AuditEventInput } from '@/server/domains/audit/types'
import type { Env } from '@/server/http/context'

import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

type UploadBody = BodyData<{ all: false }>
type UploadAuditEvent = Omit<AuditEventInput, 'actorId' | 'actorRole' | 'ipAddress' | 'userAgent' | 'createdAt'>

interface AdminUploadResult {
  response: Response
  audit: UploadAuditEvent
  logContext?: Record<string, unknown>
}

interface AdminUploadValidation<T> {
  value: T
}

interface AdminUploadRouteOptions<TValidated> {
  path: string
  maxSize: number
  /** Static copy, or a per-request resolver for locale-aware number formatting. */
  tooLargeMessage: string | ((c: Context<Env>) => string)
  missingFileMessage: string
  logScope: string
  logMessage: string
  validateBody: (
    body: UploadBody,
    c: Context<Env>,
  ) => AdminUploadValidation<TValidated> | Response | Promise<AdminUploadValidation<TValidated> | Response>
  handler: (args: {
    file: File
    body: UploadBody
    validated: TValidated
    c: Context<Env>
  }) => Promise<AdminUploadResult | Response>
}

/** Mount the invariant admin multipart-upload perimeter around a domain-specific handler. */
export function adminUploadRoute<TValidated>(options: AdminUploadRouteOptions<TValidated>): Hono<Env> {
  const log = getLogger(options.logScope)

  return new Hono<Env>().post(
    options.path,
    requireRoleMw('admin'),
    csrfGuard,
    bodyLimit({
      maxSize: options.maxSize,
      // `bodyLimit` types its context as `Context<any, any, {}>`; the mounted
      // route always runs under `Env`, so the resolver gets that same context.
      onError: (c) =>
        c.json(
          {
            error: {
              message:
                typeof options.tooLargeMessage === 'function'
                  ? options.tooLargeMessage(unsafeCast<Context<Env>>(c))
                  : options.tooLargeMessage,
            },
          },
          413,
        ),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const validation = await options.validateBody(body, c)
      if (validation instanceof Response) {
        return validation
      }

      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: options.missingFileMessage } }, 400)
      }

      const result = await options.handler({ file, body, validated: validation.value, c })
      if (result instanceof Response) {
        return result
      }

      recordAuditEventFromContext(c.var.requestContext, result.audit)
      log.info(options.logMessage, result.logContext)
      return result.response
    },
  )
}
