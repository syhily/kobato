import type { Env } from '@kobato/server/http/hono-env'

import { sqliteOf } from '@kobato/db/sqlite/database'
import { auditLog } from '@kobato/db/sqlite/schema/config'
import { user as userTable } from '@kobato/db/sqlite/schema/user'
import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { extractRequestFacts } from '@kobato/server/http/request/request-facts'
import { adminUploadRoute } from '@kobato/server/http/resources/admin-upload-route'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { clearAllTables, getTestDb } from '@kobato/server/tests/utils/integration-db'
import { adminUser, makeSession } from '@kobato/server/tests/utils/session'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const db = getTestDb()
const CSRF_TOKEN = 'test-csrf-token'

function createApp() {
  const app = new Hono<Env>()
  app.use('*', async (c, next) => {
    c.set('requestContext', {
      session: makeSession({ user: adminUser(), csrfToken: CSRF_TOKEN }),
      viewer: adminUser(),
      clientAddress: '127.0.0.1',
      requestFacts: extractRequestFacts(c.req.raw),
    } as never)
    await next()
  })
  app.route(
    '/',
    adminUploadRoute({
      path: '/upload',
      maxSize: 1024,
      tooLarge: { messageKey: 'common.error.uploadTooLarge' },
      missingFile: 'common.error.uploadMissing',
      logScope: 'test.upload',
      logMessage: 'Uploaded test file',
      validateBody: (body, c) =>
        typeof body.kind === 'string' ? { value: body.kind } : c.json({ error: { message: 'missing kind' } }, 400),
      handler: async ({ c, file, validated: kind }) => ({
        response: c.json({ kind, size: file.size }),
        audit: { action: 'test_uploaded', resourceType: 'test', resourceId: kind },
        logContext: { kind, size: file.size },
      }),
    }),
  )
  return app
}

function upload(body: FormData) {
  return createApp().request('/upload', {
    method: 'POST',
    headers: { 'User-Agent': 'test-agent', 'x-csrf-token': CSRF_TOKEN },
    body,
  })
}

beforeEach(async () => {
  initAllBatchers(getDatabaseHandle())
  await clearAllTables(db)
  __clearLogCaptureForTests()
})

afterEach(async () => {
  await flushAuditLog()
  resetAllBatchers()
})

describe('adminUploadRoute', () => {
  it('owns parsing, file validation, audit context, logging, and success response', async () => {
    await sqliteOf(db)
      .insert(userTable)
      .values({ id: 1, name: 'admin', email: 'admin@example.com', password: 'hashed' })
    const form = new FormData()
    form.append('kind', 'avatar')
    form.append('file', new File(['abc'], 'avatar.png'))

    const response = await upload(form)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'avatar', size: 3 })

    await flushAuditLog()
    const rows = await sqliteOf(db).select().from(auditLog).where(eq(auditLog.action, 'test_uploaded'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      actorId: 1,
      actorRole: 'admin',
      resourceType: 'test',
      resourceId: 'avatar',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    })

    expect(__logCaptureForTests()).toContainEqual(
      expect.objectContaining({ level: 'info', msg: 'Uploaded test file', ctx: { kind: 'avatar', size: 3 } }),
    )
  })

  it('preserves route-specific validation before the shared missing-file response', async () => {
    const invalid = await upload(new FormData())
    expect(invalid.status).toBe(400)
    await expect(invalid.json()).resolves.toEqual({ error: { message: 'missing kind' } })

    const valid = new FormData()
    valid.append('kind', 'avatar')
    const missingFile = await upload(valid)
    expect(missingFile.status).toBe(400)
    await expect(missingFile.json()).resolves.toMatchObject({
      error: { code: 'BAD_REQUEST', message: '请上传文件', descriptor: { messageKey: 'common.error.uploadMissing' } },
    })
  })
})
