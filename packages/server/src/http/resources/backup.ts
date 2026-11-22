import type { Env } from '@kobato/server/http/hono-env'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'

import { findFirstAdminUser, hasAdmin } from '@kobato/db/operations/user'
import { recordAuditEvent } from '@kobato/server/domains/audit/services/record'
import { CSRF_HEADER, validateCsrfToken } from '@kobato/server/domains/auth/csrf'
import { isSetupTokenActive } from '@kobato/server/domains/auth/setup-token'
import { parkEncryptedUpload } from '@kobato/server/domains/backup/pending-uploads'
import { withRestoreClaim } from '@kobato/server/domains/backup/restore-machine'
import {
  beginStagingProgress,
  endStagingProgress,
  reportStagingProgress,
} from '@kobato/server/domains/backup/restore-progress'
import { getBackupStream, isValidBackupKey } from '@kobato/server/domains/backup/services/backup'
import {
  type StagedBackup,
  assertStagedBackupContainsAdmin,
  EncryptedBackupPasswordRequired,
  MAX_BACKUP_FILE_SIZE,
  restoreFromStagedBackup,
  stageBackup,
} from '@kobato/server/domains/backup/services/restore'
import { startRestoreFromStaged } from '@kobato/server/domains/backup/upload-restore'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { errorJsonResponse, failureJsonResponse } from '@kobato/server/http/errors'
import { csrfGuard } from '@kobato/server/http/middlewares/csrf'
import { requireRoleMw } from '@kobato/server/http/middlewares/hono-rbac'
import { rateLimitByIp } from '@kobato/server/http/middlewares/rate-limit'
import { nodeStreamToWeb } from '@kobato/server/http/resources/serve-local-file'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { getLogger } from '@kobato/server/infra/logger'
import { unsafeCast } from '@kobato/utils/unsafe-cast'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { createMiddleware } from 'hono/factory'
import { rmSync } from 'node:fs'
import { Readable } from 'node:stream'

const log = getLogger('backup.upload')

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
        rmSync(error.dir, { recursive: true, force: true })
        return errorJsonResponse(c, 400, 'backup.error.passwordMissingUpload')
      }
      try {
        const token = parkEncryptedUpload({ dir: error.dir, uploadPath: error.uploadPath, fileName: file.name })
        return c.json({ encrypted: true, token })
      } catch (parkError) {
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
    try {
      await assertStagedBackupContainsAdmin(staged)
    } catch {
      rmSync(staged.dir, { recursive: true, force: true })
      return errorJsonResponse(c, 400, 'backup.error.invalidFileNoAdmin')
    }
  }
  return staged
}

function busyRestoreResponse(c: Context<Env>, staged: StagedBackup): Response {
  rmSync(staged.dir, { recursive: true, force: true })
  return errorJsonResponse(c, 409, 'backup.error.restoreRunning')
}

async function claimAndStartRestore(
  c: Context<Env>,
  staged: StagedBackup,
  fileName: string,
  options: { withAnalytics?: boolean },
): Promise<Response> {
  const viewer = c.var.requestContext.viewer
  const outcome = await startRestoreFromStaged(staged, fileName, {
    withAnalytics: options.withAnalytics,
    afterReopen: () => {
      recordAuditEvent({
        action: 'backup_restored',
        resourceType: 'backup',
        resourceId: fileName,
        actorId: viewer?.id ?? null,
        actorRole: viewer?.role ?? null,
        ipAddress: c.var.requestContext.clientAddress,
        userAgent: c.req.raw.headers.get('User-Agent'),
      })
    },
  })
  if (outcome === 'busy') {
    return errorJsonResponse(c, 409, 'backup.error.restoreRunning')
  }
  return c.json({ accepted: true })
}

const setupRestoreGate = createMiddleware<Env>(async (c, next) => {
  if (await hasAdmin(c.var.requestContext.db)) {
    return errorJsonResponse(c, 409, 'backup.error.siteInstalled')
  }

  const setupTokenVerified = c.var.requestContext.session.get('setupTokenVerified')
  if (!setupTokenVerified) {
    return errorJsonResponse(c, 403, 'backup.error.setupTokenIncomplete')
  }

  if (!(await isSetupTokenActive(c.var.requestContext.db))) {
    return errorJsonResponse(c, 403, 'auth.setup.error.tokenExpired')
  }

  const csrfToken = c.req.header(CSRF_HEADER)
  if (!validateCsrfToken(c.var.requestContext.session, csrfToken)) {
    return errorJsonResponse(c, 403, 'error.api.csrfFailed')
  }

  await next()
})

export const backupRouter = new Hono<Env>()
  .get('/api/admin/backup/download/:timestamp{[^/]+}', requireRoleMw('admin'), async (c) => {
    const timestamp = c.req.param('timestamp')
    if (!isValidBackupKey(timestamp)) {
      return errorJsonResponse(c, 400, 'backup.error.invalidKey')
    }
    const { stream, byteSize, encrypted, fileName } = await getBackupStream(c.var.requestContext.db, timestamp)
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

      const clientAddress = c.var.requestContext.clientAddress
      const userAgent = c.req.raw.headers.get('User-Agent')
      const fileName = file.name

      const outcome = await withRestoreClaim(async () => ({
        restoreFn: async () => {
          return restoreFromStagedBackup(staged, fileName, { withAnalytics: false })
        },
        afterReopenFn: async (db) => {
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
