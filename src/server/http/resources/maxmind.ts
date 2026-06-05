import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { mkdir, writeFile } from 'node:fs/promises'

import type { Env } from '@/server/http/context'

import { resetGeoReader } from '@/server/domains/analytics/geoip'
import { recordAuditEvent } from '@/server/domains/audit/service'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { getLogger } from '@/server/infra/logger'
import { MAXMIND_DB_PATH } from '@/server/infra/paths'

const log = getLogger('maxmind.http')

const MAXMIND_MAX_BYTES = 100 * 1024 * 1024 // 100 MiB

export const maxmindRouter = new Hono<Env>().post(
  '/api/admin/maxmind/upload',
  requireRoleMw('admin'),
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

    await mkdir(MAXMIND_DB_PATH.replace(/\/[^/]+$/, ''), { recursive: true })
    await writeFile(MAXMIND_DB_PATH, buffer)
    resetGeoReader()

    recordAuditEvent({
      action: 'maxmind_uploaded',
      actorId: c.var.viewer?.userId,
      actorRole: c.var.viewer?.role ?? null,
      resourceType: 'maxmind',
      resourceId: 'geolite2-city',
      ipAddress: c.var.clientAddress,
      userAgent: c.req.header('User-Agent') ?? null,
      details: { size: buffer.length },
    })
    log.info('MaxMind DB uploaded', { size: buffer.length, path: MAXMIND_DB_PATH })
    return c.json({ size: buffer.length })
  },
)
