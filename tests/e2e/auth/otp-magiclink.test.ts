import { DatabaseSync } from 'node:sqlite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { E2eClient, e2eEnv, getAdminCsrfToken, loginAdmin } from '#/_helpers/e2e-client'
import { SmtpCapture, extractMagicLinkPath, extractOtpCode } from '#/_helpers/e2e-mail'
import { callE2eRpc } from '#/_helpers/e2e-rpc'

const env = e2eEnv()

// OTP / magic-link journeys over real mail (in-process SMTP capture;
// nothing leaves the machine). The magic-link `login_method` flip uses
// the sanctioned KOBATO_E2E_DATABASE seam and always restores.

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

/** Authenticated admin client kept for afterAll — a fresh password login
 *  is impossible while mail is still on (it stages an OTP instead). */
let adminSession: { client: E2eClient; csrf: string } | null = null

async function rememberAdminSession(client: E2eClient): Promise<void> {
  adminSession = { client, csrf: await getAdminCsrfToken(client) }
}

beforeAll(async () => {
  const port = await capture.start()

  // Point the instance's mail transport at the capture server.
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
  // Mail goes back off so no later journey trips over the dead transport.
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

    // With mail ready, the credential step stages the OTP instead of logging in.
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
      // GET the signin page first: session cookie + CSRF token.
      const page = await client.get('/admin/signin')
      const html = await page.text()
      const csrfToken = /name="csrf_token" value="([^"]+)"/.exec(html)?.[1]
      if (!csrfToken) {
        throw new Error('no csrf_token hidden input on /admin/signin')
      }

      // Identify: the answer is deliberately generic — the link proves the account.
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

      // The loader peeks (never consumes) the token — a prefetch must not burn it.
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

      // Single-use: replaying the token fails with the generic error, not a redirect.
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
