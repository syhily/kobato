import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { createReadStream, rmSync } from 'node:fs'
import { Readable } from 'node:stream'

import type { Env } from '@/server/http/context'

import { recordAuditEvent } from '@/server/domains/audit/services/record'
import { CSRF_HEADER, validateCsrfToken } from '@/server/domains/auth/csrf'
import { isSetupTokenActive } from '@/server/domains/auth/setup-token'
import {
  claimEncryptedUploadForDecrypt,
  endDecryptClaim,
  parkEncryptedUpload,
  releaseEncryptedUpload,
} from '@/server/domains/backup/pending-uploads'
import { consumeRestoreJobReport, withRestoreClaim } from '@/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  peekRestoreProgress,
  reportStagingProgress,
} from '@/server/domains/backup/restore-progress'
import { getBackupStream, isValidBackupKey } from '@/server/domains/backup/services/backup'
import {
  type StagedBackup,
  assertStagedBackupContainsAdmin,
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
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
import { ActionFailure } from '@/server/infra/http/errors'
import { getLogger } from '@/server/infra/logger'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

const log = getLogger('backup.upload')

/** Stage + pre-validate (real DB open, admin row) before claiming the slot;
 *  every rejection cleans up. Encrypted uploads without a password are
 *  parked for the decrypt endpoint and answered with `{encrypted, token}`. */
async function stageUploadForRestore(
  c: Context<Env>,
  file: File,
  opts: { allowAnalyticsOnly: boolean; password?: string; parkEncrypted?: boolean },
): Promise<StagedBackup | Response> {
  const progressOwned = beginStagingProgress()
  let staged: StagedBackup
  try {
    staged = await stageBackup(Readable.fromWeb(unsafeCast<WebReadableStream>(file.stream())), {
      password: opts.password,
      onProgress: progressOwned
        ? (stage, doneBytes, totalBytes) => reportStagingProgress(stage, doneBytes, totalBytes)
        : undefined,
    })
  } catch (error) {
    if (error instanceof EncryptedBackupPasswordRequired) {
      if (opts.parkEncrypted === false) {
        // No two-step prompt on this surface (setup flow) — the password
        // must ride along as a form field.
        rmSync(error.dir, { recursive: true, force: true })
        return c.json({ error: { message: '该备份已加密，请同时提供备份密码。' } }, 400)
      }
      // The staged dir survives (parked) — the decrypt endpoint resumes from it.
      try {
        const token = parkEncryptedUpload({ dir: error.dir, uploadPath: error.uploadPath, fileName: file.name })
        return c.json({ encrypted: true, token })
      } catch (parkError) {
        // Park refused (cap reached with all entries mid-decrypt) — the
        // staged dir is ours again; sweep it before surfacing the error.
        rmSync(error.dir, { recursive: true, force: true })
        if (parkError instanceof ActionFailure) {
          return c.json({ error: { message: parkError.message } }, 429)
        }
        throw parkError
      }
    }
    if (error instanceof ActionFailure) {
      return c.json({ error: { message: error.message } }, 400)
    }
    return c.json({ error: { message: '备份文件无效或已损坏。' } }, 400)
  } finally {
    if (progressOwned) {
      endStagingProgress()
    }
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

/** Shared tail for both upload entry points: claim the slot and start the
 *  restore chain over an already-staged upload. */
async function claimAndStartRestore(
  c: Context<Env>,
  staged: StagedBackup,
  fileName: string,
  options: { withAnalytics?: boolean },
): Promise<Response> {
  // Scalar captures for the post-reopen audit event — the chain runs after
  // this request has already returned.
  const viewer = c.var.requestContext.viewer
  const clientAddress = c.var.requestContext.clientAddress
  const userAgent = c.req.raw.headers.get('User-Agent')
  const outcome = await withRestoreClaim(async () => ({
    restoreFn: async () => {
      const result = await restoreFromStagedBackup(staged, fileName, options)
      log.info('Restore from uploaded backup completed', { configApplied: result.configApplied })
      return result
    },
    // The swap drops the whole content DB — the audit event MUST be written
    // after the reopen (into the restored DB), like the other two restore paths.
    afterReopenFn: async () => {
      recordAuditEvent({
        action: 'backup_restored',
        resourceType: 'backup',
        resourceId: fileName,
        actorId: viewer?.id ?? null,
        actorRole: viewer?.role ?? null,
        ipAddress: clientAddress,
        userAgent,
      })
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
}

/** Setup-restore gate: authentication checks run BEFORE the rate limiter
 *  so anonymous/CSRF-failing requests never burn the 5/hour budget. */
const setupRestoreGate = createMiddleware<Env>(async (c, next) => {
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

  await next()
})

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/restore-status', requireRoleMw('admin'), (c) => {
    // Pure projection of the restore machine — consumed once on read.
    return c.json(consumeRestoreJobReport())
  })
  .get('/api/admin/backup/restore-progress', requireRoleMw('admin'), (c) => {
    // Non-consuming: the UI polls this while the server is still up; once
    // the drain closes the listener it falls back to polling /ready.
    return c.json(peekRestoreProgress())
  })
  .get('/api/admin/backup/download/:timestamp{[^/]+}', requireRoleMw('admin'), async (c) => {
    const timestamp = c.req.param('timestamp')
    if (!isValidBackupKey(timestamp)) {
      return c.json({ error: { message: '无效的备份标识。' } }, 400)
    }
    // Streamed: backups exceed the 100MB buffered-read cap, buffering would 413.
    const { stream, byteSize, encrypted, fileName } = await getBackupStream(c.var.requestContext.db, timestamp)
    // The name comes from a DB row — a restored backup can carry an arbitrary
    // storage_path, so pin the header to a quoted-string-safe whitelist.
    const safeFileName = fileName.replace(/[^A-Za-z0-9._-]/g, '_')
    c.header('Content-Type', encrypted ? 'application/octet-stream' : 'application/gzip')
    c.header('Content-Disposition', `attachment; filename="${safeFileName}"`)
    c.header('Content-Length', String(byteSize))
    recordAuditEvent({
      action: 'backup_downloaded',
      resourceType: 'backup',
      resourceId: timestamp,
      actorId: c.var.requestContext.viewer?.id ?? null,
      actorRole: c.var.requestContext.viewer?.role ?? null,
      ipAddress: c.var.requestContext.clientAddress,
      userAgent: c.req.raw.headers.get('User-Agent'),
    })
    return c.body(nodeStreamToWeb(stream))
  })
  .post(
    '/api/admin/backup/upload-restore',
    requireRoleMw('admin'),
    csrfGuard,
    // Staging writes the whole upload to disk + decrypts before the restore
    // slot is claimed — throttle so a stolen session can't multiply that.
    rateLimitByIp('backupRestoreUpload', { windowSeconds: 3600, maxAttempts: 30 }),
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

      return claimAndStartRestore(c, stagedOrError, file.name, {})
    },
  )
  .post(
    '/api/admin/backup/upload-restore/decrypt',
    requireRoleMw('admin'),
    csrfGuard,
    // Online guess attempts at the backup password cost one scrypt each —
    // throttle even though the surface is admin-only (stolen session).
    rateLimitByIp('backupRestoreDecrypt', { windowSeconds: 3600, maxAttempts: 30 }),
    bodyLimit({
      maxSize: 64 * 1024,
      onError: (c) => c.json({ error: { message: '请求体过大' } }, 413),
    }),
    async (c) => {
      // Follow-up to an `{encrypted: true, token}` upload-restore response:
      // the parked upload is staged again WITH the password.
      const body: unknown = await c.req.json().catch(() => null)
      if (typeof body !== 'object' || body === null) {
        return c.json({ error: { message: '请求格式无效' } }, 400)
      }
      const token = 'token' in body && typeof body.token === 'string' ? body.token : ''
      const password = 'password' in body && typeof body.password === 'string' ? body.password : ''
      if (token === '' || password === '') {
        return c.json({ error: { message: '请提供备份密码' } }, 400)
      }
      if (password.length > 512) {
        return c.json({ error: { message: '备份密码过长' } }, 400)
      }

      // Atomic claim: a concurrent decrypt of the SAME token would race this
      // one's release (rm of the parked dir) against its own read stream.
      const claim = claimEncryptedUploadForDecrypt(token)
      if (!claim.ok) {
        if (claim.reason === 'in-flight') {
          return c.json({ error: { message: '该上传正在解密中，请稍后重试。' } }, 409)
        }
        // 410 (distinct from a wrong-password 400): the token is dead —
        // the client must re-upload, retrying the password is pointless.
        return c.json({ error: { message: '上传会话已过期，请重新上传备份文件。' } }, 410)
      }
      const parked = claim.entry

      // What happens to the parked entry when this call ends:
      //   'keep'    — wrong password (retryable) or restore slot busy (retry later)
      //   'release' — staged and claimed, or a failure no retry can fix
      let fate: 'keep' | 'release' = 'release'
      try {
        const progressOwned = beginStagingProgress()
        let staged: StagedBackup
        try {
          staged = await stageBackup(createReadStream(parked.uploadPath), {
            password,
            onProgress: progressOwned
              ? (stage, doneBytes, totalBytes) => reportStagingProgress(stage, doneBytes, totalBytes)
              : undefined,
          })
        } catch (error) {
          // ONLY a genuine password failure keeps the parked upload —
          // structural rejections (bad tar, oversize, missing entries,
          // truncation) fail identically on every retry, so the token dies
          // here. 410 (not 400): the token is dead, the client must return
          // to the upload step instead of retrying the password prompt.
          if (error instanceof BackupPasswordError) {
            fate = 'keep'
            return c.json({ error: { message: error.message } }, 400)
          }
          if (error instanceof ActionFailure) {
            return c.json({ error: { message: error.message } }, 410)
          }
          return c.json({ error: { message: '备份文件无效或已损坏，请重新上传。' } }, 410)
        } finally {
          if (progressOwned) {
            endStagingProgress()
          }
        }

        try {
          await assertStagedBackupContainsAdmin(staged)
        } catch {
          rmSync(staged.dir, { recursive: true, force: true })
          return c.json({ error: { message: '备份文件无效或不包含管理员账号，请重新上传。' } }, 410)
        }

        const res = await claimAndStartRestore(c, staged, parked.fileName, {})
        if (res.status !== 200) {
          // Busy: the staged copy is gone, but the parked raw upload
          // survives — the same token works once the other restore ends.
          fate = 'keep'
        }
        return res
      } finally {
        if (fate === 'keep') {
          endDecryptClaim(token)
        } else {
          releaseEncryptedUpload(token)
        }
      }
    },
  )
  .post(
    '/api/setup/restore',
    setupRestoreGate,
    rateLimitByIp('setupRestore', { windowSeconds: 3600, maxAttempts: 5 }),
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
      // Encrypted backups carry their password as a plain form field here —
      // the setup flow has no two-step password prompt. Trim like the
      // create path does, so both sides derive the same key.
      const rawPassword = typeof body.password === 'string' ? body.password.trim() : ''
      if (rawPassword.length > 512) {
        return c.json({ error: { message: '备份密码过长' } }, 400)
      }
      const password = rawPassword !== '' ? rawPassword : undefined

      // Stage + pre-validate before claiming the slot (see the helper).
      const stagedOrError = await stageUploadForRestore(c, file, {
        allowAnalyticsOnly: false,
        password,
        parkEncrypted: false,
      })
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
          // Setup applies the content database + config only — a fresh install never inherits old telemetry.
          return restoreFromStagedBackup(staged, fileName, { withAnalytics: false })
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
