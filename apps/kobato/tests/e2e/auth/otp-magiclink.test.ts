import { E2eClient, bootstrapCsrfToken, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/pack/instance/client/http'
import { callE2eRpc } from '@kobato/pack/instance/client/rpc'
import { SmtpCapture, extractMagicLinkPath, extractOtpCode } from '@kobato/server/tests/utils/smtp-capture'
import { isRecord } from '@kobato/utils/type-guards'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const env = e2eEnv()

function e2eDatabasePath(): string {
  const path = process.env.KOBATO_E2E_DATABASE
  if (!path) {
    throw new Error('KOBATO_E2E_DATABASE is not set — run the suite via pnpm run sea:e2e')
  }
  return path
}

function setLoginMethod(method: 'password' | 'magic-link'): void {
  const db = new DatabaseSync(e2eDatabasePath())
  try {
    db.prepare(`UPDATE "user" SET "login_method" = ? WHERE "email" = ?`).run(method, env.adminEmail)
  } finally {
    db.close()
  }
}

const capture = new SmtpCapture()

let mailSession: { client: E2eClient; csrf: string } | null = null

async function assertAdminSession(client: E2eClient): Promise<void> {
  await getAdminCsrfToken(client)
}

beforeAll(async () => {
  const port = await capture.start()

  const admin = new E2eClient(env.baseUrl)
  const { flow } = await loginAdmin(admin, env)
  expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
  const csrfToken = await getAdminCsrfToken(admin)
  mailSession = { client: admin, csrf: csrfToken }
  const updated = await callE2eRpc(
    admin,
    '/admin/settings/update',
    {
      section: 'mail',
      payload: {
        mail: {
          enabled: true,
          transport: 'smtp',
          smtpHost: '127.0.0.1',
          smtpPort: port,
          smtpUser: 'e2e',
          smtpPass: 'e2e-capture',
          smtpSecure: false,
          smtpRequireTls: false,
          smtpRejectUnauthorized: false,
          sender: 'noreply@kobato.local',
        },
      },
    },
    csrfToken,
  )
  expect(updated.status).toBe(200)
})

afterAll(async () => {
  try {
    if (mailSession !== null) {
      await callE2eRpc(
        mailSession.client,
        '/admin/settings/update',
        { section: 'mail', payload: { mail: { enabled: false } } },
        mailSession.csrf,
      )
    }
  } finally {
    await capture.close()
  }
}, 30_000)

describe('OTP signin (HTTP e2e)', () => {
  it('password login stages an OTP, the mailed code completes the signin', async () => {
    const client = new E2eClient(env.baseUrl)
    const { flow } = await loginAdmin(client, env)

    expect(flow.type, `login answered ${flow.type}: ${flow.message ?? '(no message)'}`).toBe('redirect')
    expect(flow.to).toContain('action=verifyotp')

    const mail = await capture.nextMessage()
    expect(mail.to).toContain(env.adminEmail)
    const code = extractOtpCode(mail)

    const csrfToken = await bootstrapCsrfToken(client)
    const verified = await callE2eRpc<{ type: string; to?: string }>(
      client,
      '/account/auth/otpVerify',
      { code, redirectTo: '/admin' },
      csrfToken,
    )
    expect(verified.status).toBe(200)
    expect(verified.json.type).toBe('redirect')
    expect(verified.json.to).toBe('/admin')
    expect(client.cookieHeader()).toContain('__session=')

    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)

    await assertAdminSession(client)
  })
})

describe('magic-link signin (HTTP e2e)', () => {
  it('identify sends the link, the mailed token signs in exactly once', async () => {
    setLoginMethod('magic-link')
    try {
      const client = new E2eClient(env.baseUrl)
      const csrfToken = await bootstrapCsrfToken(client)

      const identified = await callE2eRpc<{ kind: string; message?: string }>(
        client,
        '/account/auth/identify',
        { email: env.adminEmail, redirectTo: '/admin' },
        csrfToken,
      )
      expect(identified.status).toBe(200)
      expect(identified.json.kind).toBe('magic-link-sent')

      const mail = await capture.nextMessage()
      expect(mail.to).toContain(env.adminEmail)
      const linkPath = extractMagicLinkPath(mail)
      const token = new URLSearchParams(linkPath.slice(linkPath.indexOf('?'))).get('token')
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

      const status = await client.get(
        `/rpc/account/auth/status?data=${encodeURIComponent(JSON.stringify({ json: { action: 'magiclink', token } }))}`,
        { headers: { 'x-csrf-token': csrfToken } },
      )
      expect(status.status).toBe(200)
      const statusEnvelope: unknown = await status.json()
      const statusJson = isRecord(statusEnvelope) && isRecord(statusEnvelope.json) ? statusEnvelope.json : null
      expect(statusJson?.kind).toBe('view')
      expect(statusJson?.action).toBe('magiclink')
      expect(statusJson?.magicToken).toBe(token)

      const consumed = await callE2eRpc<{ type: string; to?: string }>(
        client,
        '/account/auth/magicLink',
        { token, redirectTo: '/admin' },
        csrfToken,
      )
      expect(consumed.status).toBe(200)
      expect(consumed.json.type).toBe('redirect')
      expect(consumed.json.to).toBe('/admin')
      expect(client.cookieHeader()).toContain('__session=')

      expect((await client.get('/admin')).status).toBe(200)

      await assertAdminSession(client)

      const anonymous = new E2eClient(env.baseUrl)
      const anonCsrf = await bootstrapCsrfToken(anonymous)
      const replay = await callE2eRpc<{ type: string; message?: string }>(
        anonymous,
        '/account/auth/magicLink',
        { token, redirectTo: '/admin' },
        anonCsrf,
      )
      expect(replay.status).toBe(200)
      expect(replay.json.type).toBe('error')
      expect(replay.json.message).toContain('invalid or has expired')
    } finally {
      setLoginMethod('password')
    }
  })
})
