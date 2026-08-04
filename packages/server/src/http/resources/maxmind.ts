import type { Env } from '@kobato/server/http/context'

import { resetGeoReader } from '@kobato/server/domains/analytics/geoip'
import { withGeoipWriteLock, writeGeoipMetaBestEffort } from '@kobato/server/domains/analytics/geoip-update'
import { recordAuditEventFromContext } from '@kobato/server/domains/audit/services/record'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac'
import { getLogger } from '@kobato/server/infra/logger'
import { MAXMIND_DB_PATH } from '@kobato/server/infra/paths'
import { Reader } from '@maxmind/geoip2-node'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const log = getLogger('maxmind.http')

const MAXMIND_MAX_BYTES = 100 * 1024 * 1024 // 100 MiB

export const maxmindRouter = new Hono<Env>().post(
  '/api/admin/maxmind/upload',
  requireRoleMw('admin'),
  csrfGuard,
  bodyLimit({
    maxSize: MAXMIND_MAX_BYTES,
    onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
  }),
  async (c) => {
    const body = await c.req.parseBody({ all: false })
    const file = body.file
    if (!(file instanceof File)) {
      return c.json({ error: { message: '请上传文件' } }, 400)
    }

    if (!file.name.toLowerCase().endsWith('.mmdb')) {
      return c.json({ error: { message: '仅支持 .mmdb 格式的 MaxMind 数据库文件' } }, 400)
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length === 0) {
      return c.json({ error: { message: '上传文件为空' } }, 400)
    }

    // Serialize with the remote-update flow — both swap the same
    // database/meta pair. The write itself is atomic: stage to a temp
    // file, validate by opening it, then rename into place. A corrupt
    // upload never touches the live database (and readers never see a
    // half-written file).
    const ok = await withGeoipWriteLock(async () => {
      await mkdir(path.dirname(MAXMIND_DB_PATH), { recursive: true })
      const tmpPath = `${MAXMIND_DB_PATH}.upload`
      await writeFile(tmpPath, buffer)
      try {
        await Reader.open(tmpPath)
      } catch {
        await unlink(tmpPath).catch(() => {
          /* already deleted */
        })
        return false
      }
      await rename(tmpPath, MAXMIND_DB_PATH)

      // The swap is done — refresh the reader first, then record
      // provenance best-effort: it tells the daily auto-update this
      // database was installed manually and must not be replaced behind
      // the admin's back.
      resetGeoReader()
      await writeGeoipMetaBestEffort({ version: null, source: 'upload', updatedAt: new Date().toISOString() })
      return true
    })

    if (!ok) {
      return c.json({ error: { message: '上传的文件不是有效的 MaxMind 数据库' } }, 400)
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
