import { isRecord } from '@kobato/base/utils/type-guards'

export interface AdminCredentials {
  baseUrl: string
  adminEmail: string
  adminPassword: string
}

export interface E2eEnv extends AdminCredentials {
  baseUrl: string
  publicBaseUrl: string
  adminEmail: string
  adminPassword: string
}

export function e2eEnv(): E2eEnv {
  const { KOBATO_E2E_BASE_URL, KOBATO_E2E_PUBLIC_URL, KOBATO_E2E_ADMIN_EMAIL, KOBATO_E2E_ADMIN_PASSWORD } = process.env
  if (!KOBATO_E2E_BASE_URL || !KOBATO_E2E_PUBLIC_URL || !KOBATO_E2E_ADMIN_EMAIL || !KOBATO_E2E_ADMIN_PASSWORD) {
    throw new Error(
      'KOBATO_E2E_* env vars are not set — run the suite via pnpm run sea:e2e (KOBATO_E2E_BASE_URL is the kobato origin, KOBATO_E2E_PUBLIC_URL the sayaka origin)',
    )
  }
  return {
    baseUrl: KOBATO_E2E_BASE_URL,
    publicBaseUrl: KOBATO_E2E_PUBLIC_URL,
    adminEmail: KOBATO_E2E_ADMIN_EMAIL,
    adminPassword: KOBATO_E2E_ADMIN_PASSWORD,
  }
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
    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers, redirect: 'manual' })
    this.storeCookies(res)
    return res
  }

  get(path: string, init: Omit<RequestInit, 'method'> = {}): Promise<Response> {
    return this.send(path, { ...init, method: 'GET' })
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

export interface AuthFlowAnswer {
  type: 'redirect' | 'error' | 'success'
  to: string | null
  message: string | null
}

export async function readAuthFlow(res: Response): Promise<AuthFlowAnswer> {
  const parsed: unknown = await res.json()
  const json = isRecord(parsed) && isRecord(parsed.json) ? parsed.json : null
  if (
    json === null ||
    (json.type !== 'redirect' && json.type !== 'error' && json.type !== 'success') ||
    (json.type === 'redirect' && typeof json.to !== 'string')
  ) {
    throw new Error(`auth flow answered no flow result (HTTP ${res.status})`)
  }
  const to = typeof json.to === 'string' ? json.to : null
  return {
    type: json.type,
    to,
    message: typeof json.message === 'string' ? json.message : null,
  }
}

export async function bootstrapCsrfToken(client: E2eClient): Promise<string> {
  const res = await client.postJson('/rpc/public/content/bootstrap', {})
  if (res.status !== 200) {
    throw new Error(`public.content.bootstrap returned ${res.status}`)
  }
  const parsed: unknown = await res.json()
  const token =
    isRecord(parsed) && isRecord(parsed.json) && typeof parsed.json.csrfToken === 'string'
      ? parsed.json.csrfToken
      : null
  if (token === null) {
    throw new Error('bootstrap carried no csrfToken')
  }
  return token
}

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

export interface LoginResult {
  res: Response
  csrfToken: string
  flow: AuthFlowAnswer
}

export async function loginAdmin(client: E2eClient, credentials: AdminCredentials): Promise<LoginResult> {
  const csrfToken = await bootstrapCsrfToken(client)
  const res = await client.postJson(
    '/rpc/account/auth/login',
    { json: { email: credentials.adminEmail, password: credentials.adminPassword, redirectTo: '/admin' } },
    { 'x-csrf-token': csrfToken },
  )
  return { res, csrfToken, flow: await readAuthFlow(res) }
}

export async function getAdminCsrfToken(client: E2eClient): Promise<string> {
  const admin = await client.get('/admin')
  if (admin.status !== 200) {
    throw new Error(`GET /admin returned ${admin.status} — is the client signed in?`)
  }
  return bootstrapCsrfToken(client)
}
