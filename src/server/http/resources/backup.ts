import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { Hono } from 'hono'
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

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/restore-status', requireRoleMw('admin'), (c) => {
    // Pure projection of the restore machine: the running phase while a
    // job is in flight, the terminal report once (consumed on read).
    // Liveness readers (/ready) use peekRestoreJobPhase instead, so a
    // poll can never eat the report this endpoint is waiting to show.
    return c.json(consumeRestoreJobReport())
  })
  .get('/api/admin/backup/download/:timestamp{[^/]+}', requireRoleMw('admin'), async (c) => {
    const timestamp = c.req.param('timestamp')
    if (!isValidBackupKey(timestamp)) {
      return c.json({ error: { message: '无效的备份标识。' } }, 400)
    }
    // Streamed, not buffered: backups run to MAX_BACKUP_FILE_SIZE (500MB),
    // well past the MAX_OBJECT_BUFFER_SIZE (100MB) cap a buffered read
    // enforces — the download must not 413 on a legitimate backup.
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

      // Stage + pre-validate BEFORE claiming the slot (same choreography
      // as the setup route): the staged content database must open for
      // real and contain an admin row — the magic-byte check alone lets a
      // corrupt payload through, and a backup without an admin soft-locks
      // the restored site behind the install gate. Post-swap validation
      // would be too late: by then the original file no longer exists.
      let staged: StagedBackup
      try {
        staged = await stageBackup(Readable.fromWeb(unsafeCast<WebReadableStream>(file.stream())))
      } catch {
        return c.json({ error: { message: '备份文件无效或已损坏。' } }, 400)
      }
      if (staged.content !== null) {
        // Analytics-only uploads carry no content file to check.
        try {
          await assertStagedBackupContainsAdmin(staged)
        } catch {
          rmSync(staged.dir, { recursive: true, force: true })
          return c.json({ error: { message: '备份文件无效或不包含管理员账号。' } }, 400)
        }
      }

      // Claim as late as possible — contention cleans up the staged files.
      const fileName = file.name
      const outcome = await withRestoreClaim(async () => ({
        restoreFn: async () => {
          await restoreFromStagedBackup(staged, fileName)
          log.info('Restore from uploaded backup completed')
        },
        // drain/prepareForSwap throwing inside the machine means the swap
        // (and its finally-cleanup) never ran — drop the staged dir here.
        onFailureFn: () => {
          rmSync(staged.dir, { recursive: true, force: true })
        },
      }))
      if (outcome === 'busy') {
        rmSync(staged.dir, { recursive: true, force: true })
        return c.json({ error: { message: '已有还原任务正在进行，请等待完成后再试。' } }, 409)
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

      // Stage the upload on disk ONCE (streamed decompression), then
      // pre-validate the backup's contents (a backup without an admin
      // can never complete setup) BEFORE claiming the restore slot —
      // post-swap validation must be infallible, because the original
      // file no longer exists at that point. The staged files serve
      // both the validation and the swap, so the payload is
      // decompressed a single time and never fully held in memory.
      let staged: StagedBackup
      try {
        staged = await stageBackup(Readable.fromWeb(unsafeCast<WebReadableStream>(file.stream())))
      } catch {
        return c.json({ error: { message: '备份文件无效或已损坏。' } }, 400)
      }
      try {
        await assertStagedBackupContainsAdmin(staged)
      } catch {
        rmSync(staged.dir, { recursive: true, force: true })
        return c.json({ error: { message: '备份文件无效或不包含管理员账号。' } }, 400)
      }

      // Claim the slot as late as possible (staging + validation above
      // need no slot) — contention cleans up the staged files.
      const clientAddress = c.var.requestContext.clientAddress
      const userAgent = c.req.raw.headers.get('User-Agent')
      const fileName = file.name

      const outcome = await withRestoreClaim(async () => ({
        restoreFn: async () => {
          // Setup applies the content database only — a fresh install
          // never inherits an old site's telemetry, even when the
          // upload is a two-file archive.
          await restoreFromStagedBackup(staged, fileName, { withAnalytics: false })
        },
        afterReopenFn: async (db) => {
          // Post-restore work runs against the FRESH handle on the
          // swapped file — and it must be INFALLIBLE: the original file
          // no longer exists, so a throw here would mark the restore
          // failed while the server restarts on the swapped one. The
          // admin guarantee was pre-validated against the upload, so
          // everything here is best-effort by construction.
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
        // drain/prepareForSwap throwing inside the machine means the swap
        // (and its finally-cleanup) never ran — drop the staged dir here.
        onFailureFn: () => {
          rmSync(staged.dir, { recursive: true, force: true })
        },
      }))
      if (outcome === 'busy') {
        rmSync(staged.dir, { recursive: true, force: true })
        return c.json({ error: { message: '已有还原任务正在进行，请等待完成后再试。' } }, 409)
      }

      return c.json({ accepted: true })
    },
  )
