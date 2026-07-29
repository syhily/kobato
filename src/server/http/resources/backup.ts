import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { Env } from '@/server/http/context'

import { prepareDatabaseForRestore, reopenDb } from '@/server/bootstrap/db-lifecycle'
import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { CSRF_HEADER, validateCsrfToken } from '@/server/domains/auth/csrf'
import { isSetupTokenActive } from '@/server/domains/auth/setup-token'
import { performSafeRestore } from '@/server/domains/backup/restore-orchestrator'
import { getBackupBuffer, isValidBackupKey } from '@/server/domains/backup/services/backup'
import { restoreFromBackup } from '@/server/domains/backup/services/restore'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { findFirstAdminUser, hasAdmin } from '@/server/infra/db/operations/user'
import { getRestoreState, resetRestoreState } from '@/server/infra/lifecycle'
import { getLogger } from '@/server/infra/logger'

const log = getLogger('backup.upload')

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/restore-status', requireRoleMw('admin'), (c) => {
    const restore = getRestoreState()
    resetRestoreState()
    return c.json(restore)
  })
  .get('/api/admin/backup/download/:timestamp{[^/]+}', requireRoleMw('admin'), async (c) => {
    const timestamp = c.req.param('timestamp')
    if (!isValidBackupKey(timestamp)) {
      return c.json({ error: { message: '无效的备份标识。' } }, 400)
    }
    const buffer = await getBackupBuffer(c.var.requestContext.db, timestamp)
    const fileName = `backup-${timestamp}.db.gz`
    c.header('Content-Type', 'application/gzip')
    c.header('Content-Disposition', `attachment; filename="${fileName}"`)
    return c.body(new Uint8Array(buffer))
  })
  .post(
    '/api/admin/backup/upload-restore',
    requireRoleMw('admin'),
    csrfGuard,
    bodyLimit({
      maxSize: 500 * 1024 * 1024, // 500 MB
      onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
    }),
    async (c) => {
      if (getRestoreState().phase !== 'idle') {
        return c.json({ error: { message: '已有还原任务正在进行，请等待完成后再试。' } }, 409)
      }

      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      performSafeRestore({ prepareForSwap: prepareDatabaseForRestore, reopenAfterSwap: reopenDb, log }, async () => {
        await restoreFromBackup(buffer, file.name)
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
      if (await hasAdmin(c.var.requestContext.db)) {
        return c.json({ error: { message: '站点已安装，请直接登录后通过后台还原备份。' } }, 409)
      }

      // Require a verified session to prove console access.
      const setupTokenVerified = c.var.requestContext.session.get('setupTokenVerified')
      if (!setupTokenVerified) {
        return c.json({ error: { message: 'Setup Token 验证已过期或未完成，请先返回安装页面完成验证。' } }, 403)
      }

      // Double-check the token is still active (defense against
      // stale session flags after token expiration or invalidation).
      if (!(await isSetupTokenActive(c.var.requestContext.db))) {
        return c.json({ error: { message: 'Setup Token 已过期或失效，请重新验证。' } }, 403)
      }

      // CSRF guard: the restore request carries the same session cookie
      // as the setup flow, so we require the CSRF header to prevent
      // cross-site form submission.
      const csrfToken = c.req.header(CSRF_HEADER)
      if (!validateCsrfToken(c.var.requestContext.session, csrfToken)) {
        return c.json({ error: { message: '安全校验失败，请刷新页面后重试。' } }, 403)
      }

      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      if (getRestoreState().phase !== 'idle') {
        return c.json({ error: { message: '已有还原任务正在进行，请等待完成后再试。' } }, 409)
      }

      const buffer = Buffer.from(await file.arrayBuffer())

      const clientAddress = c.var.requestContext.clientAddress
      const userAgent = c.req.raw.headers.get('User-Agent')
      const fileName = file.name

      performSafeRestore(
        { prepareForSwap: prepareDatabaseForRestore, reopenAfterSwap: reopenDb, log },
        async () => {
          await restoreFromBackup(buffer, fileName)
        },
        async (db) => {
          // Post-restore work runs against the FRESH handle on the
          // swapped file — never the request-scoped handle the
          // orchestrator already closed.
          const admin = await findFirstAdminUser(db)
          if (!admin) {
            log.error('Setup restore: no admin found after restore', { fileName })
            throw new Error('Setup restore: no admin found after restore')
          }

          try {
            await refreshBlogSettings(db)
          } catch (err) {
            log.warn('refreshBlogSettings failed after setup restore; continuing', {
              err: err instanceof Error ? err.message : String(err),
            })
          }

          recordAuditEvent({
            action: 'setup_restored',
            resourceType: 'backup',
            resourceId: fileName,
            actorId: admin.id,
            actorRole: admin.role,
            ipAddress: clientAddress,
            userAgent,
          })

          log.info('Setup restore completed', { adminId: String(admin.id) })
        },
      )

      return c.json({ accepted: true })
    },
  )
