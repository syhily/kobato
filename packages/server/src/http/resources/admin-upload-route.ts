import type { AuditEventInput } from '@kobato/server/domains/audit/types.ts'
import type { Env } from '@kobato/server/http/context.ts'
import type { ErrorMessageParams } from '@kobato/shared/contracts/api-error.ts'
import type { UiMessageId } from '@kobato/shared/i18n/messages/ui/en-US.ts'
import type { Context } from 'hono'
import type { BodyData } from 'hono/utils/body'

import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { errorJsonResponse } from '@kobato/server/http/errors.ts'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf.ts'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

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
  /** Typed copy for the body-limit rejection; `params` may resolve per request. */
  tooLarge: { messageKey: UiMessageId; params?: (c: Context<Env>) => ErrorMessageParams }
  missingFile: UiMessageId
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
      onError: (c) => {
        const env = unsafeCast<Context<Env>>(c)
        return errorJsonResponse(env, 413, options.tooLarge.messageKey, options.tooLarge.params?.(env))
      },
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const validation = await options.validateBody(body, c)
      if (validation instanceof Response) {
        return validation
      }

      const file = body.file
      if (!(file instanceof File)) {
        return errorJsonResponse(c, 400, options.missingFile)
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
