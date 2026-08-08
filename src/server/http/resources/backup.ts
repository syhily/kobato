import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { rmSync } from 'node:fs'
import { Readable } from 'node:stream'

import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { CSRF_HEADER, validateCsrfToken } from '@/server/domains/auth/csrf'
import { isSetupTokenActive } from '@/server/domains/auth/setup-token'
import { consumeRestoreJobReport, withRestoreClaim } from '@/server/domains/backup/restore-machine'
import { getBackupStream, isValidBackupKey } from '@/server/domains/backup/services/backup'
import {
  type StagedBackup,
  assertStagedBackupContainsAdmin,
  MAX_BACKUP_FILE_SIZE,
  restoreFromStagedBackup,
  stageBackup,
} from '@/server/domains/backup/services/restore'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { csrfGuard } from '@/server/http/middlewares/csrf'
import { requireRoleMw } from '@/server/http/middlewares/hono-rbac'
import { rateLimitByIp } from '@/server/http/middlewares/rate-limit'
import { nodeStreamToWeb } from '@/server/http/resources/serve-local-file'
import { findFirstAdminUser, hasAdmin } from '@/server/infra/db/operations/user'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('backup.upload')

/** Stage + pre-validate (real DB open, admin row) before claiming the slot; every rejection cleans up. */
async function stageUploadForRestore(
  c: Context<Env>,
  file: File,
  opts: { allowAnalyticsOnly: boolean },
): Promise<StagedBackup | Response> {
  let staged: StagedBackup
  try {
    staged = await stageBackup(Readable.fromWeb(unsafeCast<WebReadableStream>(file.stream())))
  } catch {
    return c.json({ error: { message: '备份文件无效或已损坏。' } }, 400)
  }
  if (!opts.allowAnalyticsOnly || staged.content !== null) {
    // Analytics-only uploads carry no content file to check.
    try {
      await assertStagedBackupContainsAdmin(staged)
    } catch {
      rmSync(staged.dir, { recursive: true, force: true })
      return c.json({ error: { message: '备份文件无效或不包含管理员账号。' } }, 400)
    }
  }
  return staged
}

/** Slot contention: the staged upload is dropped, the caller retries later. */
function busyRestoreResponse(c: Context<Env>, staged: StagedBackup): Response {
  rmSync(staged.dir, { recursive: true, force: true })
  return c.json({ error: { message: '已有还原任务正在进行，请等待完成后再试。' } }, 409)
}

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/restore-status', requireRoleMw('admin'), (c) => {
    // Pure projection of the restore machine — consumed once on read.
    return c.json(consumeRestoreJobReport())
  })
  .get('/api/admin/backup/download/:timestamp{[^/]+}', requireRoleMw('admin'), async (c) => {
    const timestamp = c.req.param('timestamp')
    if (!isValidBackupKey(timestamp)) {
      return c.json({ error: { message: '无效的备份标识。' } }, 400)
    }
    // Streamed: backups exceed the 100MB buffered-read cap, buffering would 413.
    const { stream, byteSize } = await getBackupStream(c.var.requestContext.db, timestamp)
    const fileName = `backup-${timestamp}.db.tar.gz`
    c.header('Content-Type', 'application/gzip')
    c.header('Content-Disposition', `attachment; filename="${fileName}"`)
    c.header('Content-Length', String(byteSize))
    return c.body(nodeStreamToWeb(stream))
  })
  .post(
    '/api/admin/backup/upload-restore',
    requireRoleMw('admin'),
    csrfGuard,
    bodyLimit({
      maxSize: MAX_BACKUP_FILE_SIZE,
      onError: (c) => c.json({ error: { message: '上传文件过大' } }, 413),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      // Stage + pre-validate before claiming the slot (see the helper).
      const stagedOrError = await stageUploadForRestore(c, file, { allowAnalyticsOnly: true })
      if (stagedOrError instanceof Response) {
        return stagedOrError
      }
      const staged = stagedOrError

      // Claim as late as possible — contention cleans up the staged files.
      const fileName = file.name
      const outcome = await withRestoreClaim(async () => ({
        restoreFn: async () => {
          await restoreFromStagedBackup(staged, fileName)
          log.info('Restore from uploaded backup completed')
        },
        // A pre-swap throw means the swap never ran — drop the staged dir.
        onFailureFn: () => {
          rmSync(staged.dir, { recursive: true, force: true })
        },
      }))
      if (outcome === 'busy') {
        return busyRestoreResponse(c, staged)
      }

      return c.json({ accepted: true })
    },
  )
  .post(
    '/api/setup/restore',
    rateLimitByIp('setupRestore', { windowSeconds: 3600, maxAttempts: 5 }),
    bodyLimit({
      maxSize: MAX_BACKUP_FILE_SIZE,
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

      // Session flag may be stale after token expiry — re-check the token.
      if (!(await isSetupTokenActive(c.var.requestContext.db))) {
        return c.json({ error: { message: 'Setup Token 已过期或失效，请重新验证。' } }, 403)
      }

      // CSRF: restore rides the setup session cookie — require the CSRF header.
      const csrfToken = c.req.header(CSRF_HEADER)
      if (!validateCsrfToken(c.var.requestContext.session, csrfToken)) {
        return c.json({ error: { message: '安全校验失败，请刷新页面后重试。' } }, 403)
      }

      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return c.json({ error: { message: '请上传文件' } }, 400)
      }

      // Stage + pre-validate before claiming the slot (see the helper).
      const stagedOrError = await stageUploadForRestore(c, file, { allowAnalyticsOnly: false })
      if (stagedOrError instanceof Response) {
        return stagedOrError
      }
      const staged = stagedOrError

      // Claim the slot as late as possible — contention cleans up.
      const clientAddress = c.var.requestContext.clientAddress
      const userAgent = c.req.raw.headers.get('User-Agent')
      const fileName = file.name

      const outcome = await withRestoreClaim(async () => ({
        restoreFn: async () => {
          // Setup applies the content database only — a fresh install never inherits old telemetry.
          await restoreFromStagedBackup(staged, fileName, { withAnalytics: false })
        },
        afterReopenFn: async (db) => {
          // Runs against the fresh handle; must be infallible — the original file is gone.
          const admin = await findFirstAdminUser(db)
          if (!admin) {
            log.warn('Setup restore: admin vanished between validation and swap — skipping the audit event', {
              fileName,
            })
            return
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
        onFailureFn: () => {
          rmSync(staged.dir, { recursive: true, force: true })
        },
      }))
      if (outcome === 'busy') {
        return busyRestoreResponse(c, staged)
      }

      return c.json({ accepted: true })
    },
  )
