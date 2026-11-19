import type { Env } from '@kobato/server/http/hono-env.ts'
import type { Context } from 'hono'

import { resetGeoReader } from '@kobato/server/domains/analytics/geoip/lookup.ts'
import { withGeoipWriteLock, writeGeoipMetaBestEffort } from '@kobato/server/domains/analytics/geoip/update.ts'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record.ts'
import { errorJsonResponse } from '@kobato/server/http/errors.ts'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf.ts'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac.ts'
import { MAXMIND_DB_PATH } from '@kobato/server/infra/data-paths.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { Reader } from '@maxmind/geoip2-node'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const log = getLogger('maxmind.http')

const MAXMIND_MAX_BYTES = 100 * 1024 * 1024

export const maxmindRouter = new Hono<Env>().post(
  '/api/admin/maxmind/upload',
  requireRoleMw('admin'),
  csrfGuard,
  bodyLimit({
    maxSize: MAXMIND_MAX_BYTES,
    onError: (c: Context<Env>) => errorJsonResponse(c, 413, 'common.error.uploadTooLarge'),
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: false })
    const file = body.file
    if (!(file instanceof File)) {
      return errorJsonResponse(c, 400, 'common.error.uploadMissing')
    }

    if (!file.name.toLowerCase().endsWith('.mmdb')) {
      return errorJsonResponse(c, 400, 'maxmind.error.wrongFormat')
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return errorJsonResponse(c, 400, 'common.error.uploadEmpty')
    }

    const ok = await withGeoipWriteLock(async () => {
      await mkdir(path.dirname(MAXMIND_DB_PATH), { recursive: true })
      const tmpPath = `${MAXMIND_DB_PATH}.upload`
      await writeFile(tmpPath, buffer)
      try {
        await Reader.open(tmpPath)
      } catch {
        await unlink(tmpPath).catch(() => undefined)
        return false
      }
      await rename(tmpPath, MAXMIND_DB_PATH)

      resetGeoReader()
      await writeGeoipMetaBestEffort({ version: null, source: 'upload', updatedAt: new Date().toISOString() })
      return true
    })

    if (!ok) {
      return errorJsonResponse(c, 400, 'maxmind.error.invalidDb')
    }

    recordAuditEventFromContext(c.var.requestContext, {
      action: 'maxmind_uploaded',
      resourceType: 'maxmind',
      resourceId: 'geolite2-city',
      details: { size: buffer.length },
    })
    log.info('MaxMind DB uploaded', { size: buffer.length, path: MAXMIND_DB_PATH })
    return c.json({ size: buffer.length })
  },
)
