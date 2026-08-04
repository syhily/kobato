import type { Env } from '@kobato/server/http/context'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { adminUser, makeSession } from '#/_helpers/session'

import { getDatabaseHandle } from '@kobato/server/bootstrap/db-lifecycle'
import { flushAuditLog } from '@kobato/server/domains/audit/services/batcher'
import { adminUploadRoute } from '@kobato/server/http/resources/admin-upload-route'
import { extractRequestFacts } from '@kobato/server/http/utils/request-facts'
import { initAllBatchers, resetAllBatchers } from '@kobato/server/infra/db/batcher-registry'
import { auditLog } from '@kobato/server/infra/db/schema/config'
import { user as userTable } from '@kobato/server/infra/db/schema/user'
import { __clearLogCaptureForTests, __logCaptureForTests } from '@kobato/server/infra/logger'
import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// `adminUploadRoute` against the real engine: the CSRF guard runs for
// real (session-carried token + `x-csrf-token` header), and the audit
// write goes through the real record → batcher → `audit_log` path —
// asserted on the flushed row, with the flush/reset hygiene from
// domains/auth/password-flow so no stale events leak into the next
// case. No module mocks remain; the route's own handler is inlined per
// its design.

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
      tooLargeMessage: 'too large',
      missingFileMessage: 'missing file',
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
  // Flush BEFORE dropping the batcher: InsertBatcher.dispose() leaves an
  // armed flush timer behind, so an unflushed queue would otherwise
  // insert this case's stale events mid-next-test. The rows flushed here
  // are wiped by the next beforeEach's clearAllTables.
  await flushAuditLog()
  resetAllBatchers()
})

describe('adminUploadRoute', () => {
  it('owns parsing, file validation, audit context, logging, and success response', async () => {
    // The audit row's actorId FK points at a real user — seed the admin
    // the session's viewer ('1') stands for.
    await db.insert(userTable).values({ id: 1, name: 'admin', email: 'admin@example.com', password: 'hashed' })
    const form = new FormData()
    form.append('kind', 'avatar')
    form.append('file', new File(['abc'], 'avatar.png'))

    const response = await upload(form)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'avatar', size: 3 })

    // The audit write landed through the real batcher, attributed from
    // the request context (viewer, client address, request facts).
    await flushAuditLog()
    const rows = await db.select().from(auditLog).where(eq(auditLog.action, 'test_uploaded'))
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
    await expect(missingFile.json()).resolves.toEqual({ error: { message: 'missing file' } })
  })
})
