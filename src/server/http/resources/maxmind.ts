import type { Context } from 'hono'

import { Reader } from '@maxmind/geoip2-node'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { Env } from '@/server/http/context'

import { resetGeoReader } from '@/server/domains/analytics/geoip'
import { withGeoipWriteLock, writeGeoipMetaBestEffort } from '@/server/domains/analytics/geoip-update'
import { recordAuditEventFromContext } from '@/server/domains/audit/services/record'
import { errorJsonResponse } from '@/server/http/errors'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { MAXMIND_DB_PATH } from '@/server/infra/paths'

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

    // Serialize with the remote-update flow; the write is atomic — stage,
    // validate by opening, then rename. A corrupt upload never touches the live DB.
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

      // Refresh the reader first, then mark provenance — the daily auto-update
      // must not replace a manually installed database.
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
