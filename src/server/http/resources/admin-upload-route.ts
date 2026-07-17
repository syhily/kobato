import type { Context } from 'hono'
import type { BodyData } from 'hono/utils/body'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { AuditEventInput } from '@/server/domains/audit/types'
import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'

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
  tooLargeMessage: string
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
      onError: (c) => c.json({ error: { message: options.tooLargeMessage } }, 413),
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

      recordAuditEvent({
        ...result.audit,
        actorId: c.var.viewer?.userId,
        actorRole: c.var.viewer?.role ?? null,
        ipAddress: c.var.clientAddress,
        userAgent: c.req.header('User-Agent') ?? null,
      })
      log.info(options.logMessage, result.logContext)
      return result.response
    },
  )
}
