import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/service'
import { performSafeRestore } from '@/server/domains/backup/restore-orchestrator'
import {
  checkPgToolsAvailable,
  extractBackupSql,
  getBackupBuffer,
  restoreFromSql,
  validateBackupSql,
} from '@/server/domains/backup/service'
import { refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { hasAdmin, findFirstAdminUser } from '@/server/infra/db/operations/user'
import { getRestoreResult, resetRestoreResult } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.upload')

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/restore-status', requireRoleMw('admin'), (c) => {
    const restore = getRestoreResult()
    resetRestoreResult()
    return c.json(restore)
  })
  .get('/api/admin/backup/download/:key{.+}', requireRoleMw('admin'), async (c) => {
    const key = c.req.param('key')
    const buffer = await getBackupBuffer(key)
    const fileName = key.split('/').pop() ?? 'backup.sql.gz'
    c.header('Content-Type', 'application/gzip')
    c.header('Content-Disposition', `attachment; filename="${fileName}"`)
    return c.body(new Uint8Array(buffer))
  })
  .post(
    '/api/admin/backup/upload-restore',
    requireRoleMw('admin'),
    bodyLimit({
      maxSize: 500 * 1024 * 1024, // 500 MB
      onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const sql = await extractBackupSql(buffer, file.name)
      validateBackupSql(sql)

      performSafeRestore({ pool: c.var.pool, log }, async () => {
        await restoreFromSql(c.var.db, sql)
        log.info('Restore from uploaded backup completed')
      })

      return c.json({ accepted: true })
    },
  )
  .post(
    '/api/setup/restore',
    rateLimitByIp('setupRestore', { windowSeconds: 3600, maxAttempts: 5 }),
    bodyLimit({
      maxSize: 500 * 1024 * 1024, // 500 MB
      onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
    }),
    async (c) => {
      if (await hasAdmin(c.var.db)) {
        return c.json({ error: { message: '站点已安装，请直接登录后通过后台还原备份。' } }, 409)
      }

      if (!(await checkPgToolsAvailable())) {
        return c.json({ error: { message: '当前运行环境缺少 postgresql-client，无法还原备份。' } }, 503)
      }

      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const sql = await extractBackupSql(buffer, file.name)
      validateBackupSql(sql)

      const clientAddress = c.var.clientAddress
      const userAgent = c.req.raw.headers.get('User-Agent')
      const fileName = file.name

      performSafeRestore({ pool: c.var.pool, log }, async () => {
        await restoreFromSql(c.var.db, sql)

        const admin = await findFirstAdminUser(c.var.db)
        if (!admin) {
          log.error('Setup restore: no admin found after restore', { fileName })
          throw new Error('Setup restore: no admin found after restore')
        }

        try {
          await refreshBlogSettings(c.var.db)
        } catch (err) {
          log.warn('refreshBlogSettings failed after setup restore; continuing', {
            err: err instanceof Error ? err.message : String(err),
          })
        }

        recordAuditEvent(c.var.db, c.var.pool, {
          action: 'setup_restored',
          resourceType: 'backup',
          resourceId: fileName,
          actorId: admin.id,
          actorRole: admin.role,
          ipAddress: clientAddress,
          userAgent,
        })

        log.info('Setup restore completed', { adminId: String(admin.id) })
      })

      return c.json({ accepted: true })
    },
  )
