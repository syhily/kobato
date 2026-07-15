import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { uploadFont, FONT_MAX_BYTES } from '@/server/domains/fonts/services/upload'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { formatBytes } from '@/shared/utils/formatter'

const log = getLogger('fonts.package.http')

/**
 * Font *package* upload (self-hosted browser web fonts). Kept as a native
 * Hono resource route rather than an oRPC procedure because source fonts can
 * be 60 MiB and the oRPC bridge sits behind the request-wide body limit
 * (default 10 MB). Mounting this route before `createApiApp()` (see
 * `middleware-pipeline.ts`) gives it its own `bodyLimit`, exactly like the
 * legacy canvas-font upload at `resources/fonts.ts`.
 *
 * The synchronous slice (~15–20s for a CJK font) happens inside the request
 * lifetime; the client shows a spinner and the row is only inserted on
 * success, so there is no `processing`/`failed` state.
 */
export const fontsPackageRouter = new Hono<Env>().post(
  '/api/admin/fonts/package/upload',
  requireRoleMw('admin'),
  csrfGuard,
  bodyLimit({
    maxSize: FONT_MAX_BYTES,
    onError: (c) => c.json({ error: { message: `上传文件过大（上限 ${formatBytes(FONT_MAX_BYTES)}）` } }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: false })
    const file = body.file
    const familyName = body.familyName

    if (typeof familyName !== 'string' || familyName.trim() === '') {
      return c.json({ error: { message: '字体名称不能为空' } }, 400)
    }
    if (!(file instanceof File)) {
      return c.json({ error: { message: '请上传字体文件' } }, 400)
    }

    const buffer = new Uint8Array(await file.arrayBuffer())
    const font = await uploadFont(c.var.db, {
      buffer,
      sourceName: file.name || 'font.ttf',
      familyName,
    })

    recordAuditEvent({
      action: 'font_uploaded',
      actorId: c.var.viewer?.userId,
      actorRole: c.var.viewer?.role ?? null,
      resourceType: 'font',
      resourceId: font.id,
      ipAddress: c.var.clientAddress,
      userAgent: c.req.header('User-Agent') ?? null,
      details: { familyName: font.familyName, hash: font.hash, size: buffer.length },
    })
    log.info('Font package uploaded', { id: font.id, familyName: font.familyName, size: buffer.length })

    return c.json({ font })
  },
)
