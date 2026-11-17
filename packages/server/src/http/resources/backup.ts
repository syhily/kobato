import type { Env } from '@kobato/server/http/context.ts'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { findFirstAdminUser, hasAdmin } from '@kobato/db/operations/user.ts'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record.ts'
import { CSRF_HEADER, validateCsrfToken } from '@kobato/server/domains/auth/csrf.ts'
import { isSetupTokenActive } from '@kobato/server/domains/auth/setup-token.ts'
import {
  claimEncryptedUploadForDecrypt,
  endDecryptClaim,
  parkEncryptedUpload,
  releaseEncryptedUpload,
} from '@kobato/server/domains/backup/pending-uploads.ts'
import { consumeRestoreJobReport, withRestoreClaim } from '@kobato/server/domains/backup/restore-machine.ts'
import {
  beginStagingProgress,
  endStagingProgress,
  peekRestoreProgress,
  reportStagingProgress,
} from '@kobato/server/domains/backup/restore-progress.ts'
import { getBackupStream, isValidBackupKey } from '@kobato/server/domains/backup/services/backup.ts'
import {
  type StagedBackup,
  assertStagedBackupContainsAdmin,
  BackupPasswordError,
  EncryptedBackupPasswordRequired,
  MAX_BACKUP_FILE_SIZE,
  restoreFromStagedBackup,
  stageBackup,
} from '@kobato/server/domains/backup/services/restore.ts'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate.ts'
import { errorJsonResponse, failureJsonResponse } from '@kobato/server/http/errors.ts'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf.ts'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac.ts'
import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit.ts'
import { nodeStreamToWeb } from '@kobato/server/http/resources/serve-local-file.ts'
import { ActionFailure } from '@kobato/server/infra/http/errors.ts'
import { getLogger } from '@kobato/server/infra/logger.ts'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { createReadStream, rmSync } from 'node:fs'
import { Readable } from 'node:stream'

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
        return errorJsonResponse(c, 400, 'backup.error.passwordMissingUpload')
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
          return failureJsonResponse(c, parkError, 429)
        }
        throw parkError
      }
    }
    if (error instanceof ActionFailure) {
      return failureJsonResponse(c, error, 400)
    }
    return errorJsonResponse(c, 400, 'backup.error.invalidFile')
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
      return errorJsonResponse(c, 400, 'backup.error.invalidFileNoAdmin')
    }
  }
  return staged
}

/** Slot contention: the staged upload is dropped, the caller retries later. */
function busyRestoreResponse(c: Context<Env>, staged: StagedBackup): Response {
  rmSync(staged.dir, { recursive: true, force: true })
  return errorJsonResponse(c, 409, 'backup.error.restoreRunning')
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
    return errorJsonResponse(c, 409, 'backup.error.siteInstalled')
  }

  // Require a verified session to prove console access.
  const setupTokenVerified = c.var.requestContext.session.get('setupTokenVerified')
  if (!setupTokenVerified) {
    return errorJsonResponse(c, 403, 'backup.error.setupTokenIncomplete')
  }

  // Session flag may be stale after token expiry — re-check the token.
  if (!(await isSetupTokenActive(c.var.requestContext.db))) {
    return errorJsonResponse(c, 403, 'auth.setup.error.tokenExpired')
  }

  // CSRF: restore rides the setup session cookie — require the CSRF header.
  const csrfToken = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, csrfToken)) {
    return errorJsonResponse(c, 403, 'error.api.csrfFailed')
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
      return errorJsonResponse(c, 400, 'backup.error.invalidKey')
    }
    // Streamed: backups exceed the 100MB buffered-read cap, buffering would 413.
    const { stream, byteSize, encrypted, fileName } = await getBackupStream(c.var.requestContext.db, timestamp)
    // The name comes from a DB row; `getBackupStream` already refused a path
    // that is not a backup key, and the whitelist keeps the header safe even if
    // that ever regresses.
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
      onError: (c: Context<Env>) => errorJsonResponse(c, 413, 'backup.error.uploadTooLarge'),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return errorJsonResponse(c, 400, 'backup.error.uploadMissing')
      }

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
      onError: (c: Context<Env>) => errorJsonResponse(c, 413, 'error.api.payloadTooLarge'),
    }),
    async (c) => {
      // Follow-up to an `{encrypted: true, token}` upload-restore response:
      // the parked upload is staged again WITH the password.
      const body: unknown = await c.req.json().catch(() => null)
      if (typeof body !== 'object' || body === null) {
        return errorJsonResponse(c, 400, 'backup.error.requestInvalid')
      }
      const token = 'token' in body && typeof body.token === 'string' ? body.token : ''
      const password = 'password' in body && typeof body.password === 'string' ? body.password : ''
      if (token === '' || password === '') {
        return errorJsonResponse(c, 400, 'backup.error.passwordMissing')
      }
      if (password.length > 512) {
        return errorJsonResponse(c, 400, 'backup.error.passwordTooLong')
      }

      // Atomic claim: a concurrent decrypt of the SAME token would race this
      // one's release (rm of the parked dir) against its own read stream.
      const claim = claimEncryptedUploadForDecrypt(token)
      if (!claim.ok) {
        if (claim.reason === 'in-flight') {
          return errorJsonResponse(c, 409, 'backup.error.decryptInProgress')
        }
        // 410 (distinct from a wrong-password 400): the token is dead —
        // the client must re-upload, retrying the password is pointless.
        return errorJsonResponse(c, 410, 'backup.error.uploadExpired')
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
          // Only a genuine password failure keeps the parked upload — structural
          // rejections fail on every retry, so the token dies here (410, not 400).
          if (error instanceof BackupPasswordError) {
            fate = 'keep'
            return failureJsonResponse(c, error, 400)
          }
          if (error instanceof ActionFailure) {
            return failureJsonResponse(c, error, 410)
          }
          return errorJsonResponse(c, 410, 'backup.error.invalidFileReupload')
        } finally {
          if (progressOwned) {
            endStagingProgress()
          }
        }

        try {
          await assertStagedBackupContainsAdmin(staged)
        } catch {
          rmSync(staged.dir, { recursive: true, force: true })
          return errorJsonResponse(c, 410, 'backup.error.invalidFileNoAdminReupload')
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
      onError: (c: Context<Env>) => errorJsonResponse(c, 413, 'backup.error.uploadTooLarge'),
    }),
    async (c) => {
      const body = await c.req.parseBody({ all: false })
      const file = body.file
      if (!(file instanceof File)) {
        return errorJsonResponse(c, 400, 'backup.error.uploadMissing')
      }
      // Encrypted backups carry their password as a plain form field here —
      // the setup flow has no two-step password prompt. Trim like the
      // create path does, so both sides derive the same key.
      const rawPassword = typeof body.password === 'string' ? body.password.trim() : ''
      if (rawPassword.length > 512) {
        return errorJsonResponse(c, 400, 'backup.error.passwordTooLong')
      }
      const password = rawPassword !== '' ? rawPassword : undefined

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
