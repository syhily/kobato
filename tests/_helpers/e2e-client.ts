// HTTP client for tests/e2e — drives a real kobato instance (the SEA
// binary booted by scripts/sea/e2e.ts) over plain fetch with a minimal
// cookie jar. No in-process shortcuts: everything goes through the wire.

export interface E2eEnv {
  baseUrl: string
  adminEmail: string
  adminPassword: string
}

/** Read and validate the env contract injected by scripts/sea/e2e.ts. */
export function e2eEnv(): E2eEnv {
  const { KOBATO_E2E_BASE_URL, KOBATO_E2E_ADMIN_EMAIL, KOBATO_E2E_ADMIN_PASSWORD } = process.env
  if (!KOBATO_E2E_BASE_URL || !KOBATO_E2E_ADMIN_EMAIL || !KOBATO_E2E_ADMIN_PASSWORD) {
    throw new Error('KOBATO_E2E_* env vars are not set — run the suite via pnpm run sea:e2e')
  }
  return { baseUrl: KOBATO_E2E_BASE_URL, adminEmail: KOBATO_E2E_ADMIN_EMAIL, adminPassword: KOBATO_E2E_ADMIN_PASSWORD }
}

export class E2eClient {
  private readonly cookies = new Map<string, string>()

  constructor(private readonly baseUrl: string) {}

  cookieHeader(): string | undefined {
    if (this.cookies.size === 0) {
      return undefined
    }
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  }

  private storeCookies(res: Response): void {
    for (const setCookie of res.headers.getSetCookie()) {
      const pair = setCookie.split(';')[0]
      const eq = pair.indexOf('=')
      if (eq > 0) {
        this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
      }
    }
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers)
    const cookie = this.cookieHeader()
    if (cookie !== undefined) {
      headers.set('cookie', cookie)
    }
    // Redirects are asserted explicitly in e2e — never follow silently.
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers, redirect: 'manual' })
    this.storeCookies(res)
    return res
  }

  get(path: string): Promise<Response> {
    return this.send(path, { method: 'GET' })
  }

  postForm(path: string, fields: Record<string, string>): Promise<Response> {
    return this.send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    })
  }

  postJson(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<Response> {
    return this.send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    })
  }
}

/**
 * The anonymous visitor's CSRF token — the one 64-hex value in the page.
 * Use only on pages without 64-hex avatars or branding etags.
 */
export async function getPublicCsrfToken(client: E2eClient, path: string): Promise<string> {
  const res = await client.get(path)
  if (res.status !== 200) {
    throw new Error(`GET ${path} returned ${res.status}`)
  }
  const html = await res.text()
  const unique = [...new Set(html.match(/[0-9a-f]{64}/g) ?? [])]
  if (unique.length !== 1) {
    throw new Error(`expected exactly one 64-hex CSRF token on ${path}, found ${unique.length}`)
  }
  return unique[0]
}

/**
 * Real signin over HTTP. Returns the action response (302 + Set-Cookie on
 * success) and the PRE-login CSRF token — valid only for the login POST;
 * use `getAdminCsrfToken` for authenticated RPCs.
 */
export async function loginAdmin(client: E2eClient, env: E2eEnv): Promise<{ res: Response; csrfToken: string }> {
  const page = await client.get('/admin/signin')
  const html = await page.text()
  const match = html.match(/name="csrf_token" value="([^"]+)"/)
  if (!match) {
    throw new Error('no csrf_token hidden input on /admin/signin')
  }
  const csrfToken = match[1]
  const res = await client.postForm('/admin/signin', {
    csrf_token: csrfToken,
    email: env.adminEmail,
    password: env.adminPassword,
  })
  return { res, csrfToken }
}

/** The authenticated session's CSRF token — the one 64-hex value in the
 *  /admin document. Required as `x-csrf-token` on every /rpc/* call. */
export async function getAdminCsrfToken(client: E2eClient): Promise<string> {
  const res = await client.get('/admin')
  if (res.status !== 200) {
    throw new Error(`GET /admin returned ${res.status} — is the client signed in?`)
  }
  const html = await res.text()
  const unique = [...new Set(html.match(/[0-9a-f]{64}/g) ?? [])]
  if (unique.length !== 1) {
    throw new Error(`expected exactly one 64-hex CSRF token on /admin, found ${unique.length}`)
  }
  return unique[0]
}
