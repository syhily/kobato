import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '@kobato/pack/instance/client/http'
import { callE2eRpc } from '@kobato/pack/instance/client/rpc'
import { SmtpCapture, extractMagicLinkPath, extractOtpCode } from '@kobato/server/tests/utils/smtp-capture'
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

let adminSession: { client: E2eClient; csrf: string } | null = null

async function rememberAdminSession(client: E2eClient): Promise<void> {
  adminSession = { client, csrf: await getAdminCsrfToken(client) }
}

beforeAll(async () => {
  const port = await capture.start()

  const admin = new E2eClient(env.baseUrl)
  const { res } = await loginAdmin(admin, env)
  expect(res.status).toBe(302)
  const csrfToken = await getAdminCsrfToken(admin)
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
    if (adminSession !== null) {
      await callE2eRpc(
        adminSession.client,
        '/admin/settings/update',
        { section: 'mail', payload: { mail: { enabled: false } } },
        adminSession.csrf,
      )
    }
  } finally {
    await capture.close()
  }
}, 30_000)

describe('OTP signin (HTTP e2e)', () => {
  it('password login stages an OTP, the mailed code completes the signin', async () => {
    const client = new E2eClient(env.baseUrl)
    const { res, csrfToken } = await loginAdmin(client, env)

    expect(res.status).toBe(302)
    const verifyUrl = new URL(res.headers.get('location')!, env.baseUrl)
    expect(verifyUrl.searchParams.get('action')).toBe('verifyotp')

    const mail = await capture.nextMessage()
    expect(mail.to).toContain(env.adminEmail)
    const code = extractOtpCode(mail)

    const verified = await client.postForm(`/admin/signin${verifyUrl.search}`, {
      csrf_token: csrfToken,
      otp_code: code,
    })
    expect(verified.status).toBe(302)
    expect(verified.headers.get('location')).toBe('/admin')
    expect(client.cookieHeader()).toContain('__session=')

    const admin = await client.get('/admin')
    expect(admin.status).toBe(200)

    await rememberAdminSession(client)
  })
})

describe('magic-link signin (HTTP e2e)', () => {
  it('identify sends the link, the mailed token signs in exactly once', async () => {
    setLoginMethod('magic-link')
    try {
      const client = new E2eClient(env.baseUrl)

      const page = await client.get('/admin/signin')
      const html = await page.text()
      const csrfToken = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1]
      if (!csrfToken) {
        throw new Error('no csrf_token hidden input on /admin/signin')
      }

      const identified = await client.postForm('/admin/signin?action=identify&redirect_to=%2Fadmin', {
        csrf_token: csrfToken,
        email: env.adminEmail,
      })
      expect(identified.status).toBe(200)
      expect(await identified.text()).toContain('登录链接已发送')

      const mail = await capture.nextMessage()
      expect(mail.to).toContain(env.adminEmail)
      const linkPath = extractMagicLinkPath(mail)
      const token = new URLSearchParams(linkPath.slice(linkPath.indexOf('?'))).get('token')
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)

      const confirm = await client.get(linkPath)
      expect(confirm.status).toBe(200)
      expect(await confirm.text()).toContain('name="magic_token"')

      const consumed = await client.postForm(`/admin/signin${linkPath.slice(linkPath.indexOf('?'))}`, {
        csrf_token: csrfToken,
        magic_token: token!,
      })
      expect(consumed.status).toBe(302)
      expect(consumed.headers.get('location')).toBe('/admin')
      expect(client.cookieHeader()).toContain('__session=')

      expect((await client.get('/admin')).status).toBe(200)

      await rememberAdminSession(client)

      const anonymous = new E2eClient(env.baseUrl)
      const anonPage = await anonymous.get('/admin/signin')
      const anonCsrf = /name="csrf_token" value="([^"]+)"/.exec(await anonPage.text())?.[1]
      if (!anonCsrf) {
        throw new Error('no csrf_token hidden input on /admin/signin')
      }
      const replay = await anonymous.postForm(`/admin/signin${linkPath.slice(linkPath.indexOf('?'))}`, {
        csrf_token: anonCsrf,
        magic_token: token!,
      })
      expect(replay.status).toBe(200)
      expect(await replay.text()).toContain('链接无效或已过期')
    } finally {
      setLoginMethod('password')
    }
  })
})
