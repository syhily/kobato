import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'
import type { ZodType } from 'zod'

import { data, redirect } from 'react-router'

import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { AssetsSettings, SiteIdentitySettings } from '@/shared/config/types'

import { establishLoginSession, login } from '@/server/domains/auth/primitives'
import { commitSessionWithMaxAge } from '@/server/domains/auth/session-storage'
import { invalidateSetupToken } from '@/server/domains/auth/setup-token'
import {
  ASSETS_STORAGE_INSTALL_DEFAULTS,
  buildDefaultSectionPayloads,
  SECTION_REGISTRY,
  type SettingsSection,
} from '@/server/domains/settings/sections'
import { refreshBlogSettings } from '@/server/domains/settings/snapshot'
import { upsertSetting } from '@/server/infra/db/operations/setting'
import { hasAdmin, insertAdmin } from '@/server/infra/db/operations/user'
import { tryRateLimit } from '@/server/infra/rate-limit'
import { idFromString } from '@/shared/utils/id'

interface AuthFailure {
  ok: false
  status: number
  message: string
  headers: HeadersInit
}

interface AuthSuccess<T> {
  ok: true
  data: T
  headers: HeadersInit
}

export type AuthFlowResult<T> = AuthFailure | AuthSuccess<T>

async function commitHeaders(session: BlogSession, extraSetCookie?: string): Promise<HeadersInit> {
  const sessionCookie = await commitSessionWithMaxAge(session)
  if (extraSetCookie === undefined) {
    return { 'Set-Cookie': sessionCookie }
  }
  const headers = new Headers()
  headers.append('Set-Cookie', sessionCookie)
  headers.append('Set-Cookie', extraSetCookie)
  return headers
}

export async function signInWithSession(
  db: NodePgDatabase,
  pool: Pool,
  {
    email,
    password,
    session,
    request,
    clientAddress,
    redirectTo,
  }: {
    email: string
    password: string
    session: BlogSession
    request: Request
    clientAddress: string
    redirectTo: string
  },
): Promise<AuthFlowResult<{ redirectTo: string }>> {
  const limit = await tryRateLimit(clientAddress)
  if (limit.exceeded) {
    return {
      ok: false,
      status: 429,
      message: '登录失败次数过多，请稍后再试。',
      headers: await commitHeaders(session),
    }
  }

  const established = await login(db, pool, { email, password, session, request, clientAddress })
  if (!established) {
    return {
      ok: false,
      status: 403,
      message: '登录凭证无效。',
      headers: await commitHeaders(session),
    }
  }

  return {
    ok: true,
    data: { redirectTo },
    headers: { 'Set-Cookie': established.setCookie },
  }
}

export interface SignUpAdminSeed {
  title: string
  name: string
  email: string
  password: string
}

export async function signUpInitialAdminWithSession(
  db: NodePgDatabase,
  pool: Pool,
  {
    title,
    name,
    email,
    password,
    session,
    request,
    clientAddress,
  }: SignUpAdminSeed & {
    session: BlogSession
    request: Request
    clientAddress: string
  },
): Promise<AuthFlowResult<{ redirectTo: string }>> {
  if (await hasAdmin(db)) {
    return {
      ok: false,
      status: 409,
      message: '管理员账号已存在，请直接登录后继续初始化。',
      headers: await commitHeaders(session),
    }
  }

  const users = await insertAdmin(db, name, email, password)
  const admin = users[0]
  if (!admin) {
    return {
      ok: false,
      status: 500,
      message: '创建管理员账号失败',
      headers: await commitHeaders(session),
    }
  }

  const established = await establishLoginSession(db, pool, session, admin, request, clientAddress)

  // ── Seed all settings sections in one pass ──
  const hostname = new URL(request.url).hostname
  const siteIdentity: SiteIdentitySettings = {
    title,
    description: 'Welcome',
    website: `https://${hostname}`,
    keywords: [],
    author: { name: admin.name, email: admin.email, url: `https://${hostname}` },
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
    timeFormat: 'yyyy-LL-dd HH:mm',
    initialYear: new Date().getFullYear(),
    icpNo: '',
    moeIcpNo: '',
  }

  const assets: AssetsSettings = {
    asset: { host: hostname, scheme: 'https' },
    ...ASSETS_STORAGE_INSTALL_DEFAULTS,
  }

  const defaultPayloads = buildDefaultSectionPayloads()

  const generalPayload: Record<string, unknown> = { ...siteIdentity }
  const assetsPayload: Record<string, unknown> = { ...assets }

  const sections: { section: SettingsSection; payload: Record<string, unknown> }[] = [
    { section: 'general', payload: generalPayload },
    { section: 'assets', payload: assetsPayload },
    ...defaultPayloads,
  ]

  // Validate every section against its schema before writing any.
  const updatedBy = idFromString(admin.id)
  for (const { section, payload } of sections) {
    const meta = SECTION_REGISTRY[section]
    const check = meta.schema.safeParse(payload)
    if (!check.success) {
      const first = check.error.issues[0]
      const path = first ? first.path.join('.') : '<unknown>'
      return {
        ok: false,
        status: 400,
        message: `${meta.scope} 校验失败（${path}）：${first?.message ?? '未知错误'}`,
        headers: await commitHeaders(session),
      }
    }
  }

  for (const { section, payload } of sections) {
    const meta = SECTION_REGISTRY[section]
    const check = meta.schema.safeParse(payload)
    if (check.success) {
      await upsertSetting(db, check.data as Record<string, unknown>, updatedBy, meta.scope)
    }
  }

  await refreshBlogSettings(db)
  invalidateSetupToken()

  return {
    ok: true,
    data: { redirectTo: '/admin' },
    headers: { 'Set-Cookie': established.setCookie },
  }
}

export async function processAuthFormSubmission<I>({
  request,
  schema,
  fields,
  defaultErrorMessage,
  redirectTo,
  run,
  formData: providedFormData,
}: {
  request: Request
  schema: ZodType<I>
  fields: readonly string[]
  defaultErrorMessage: string
  redirectTo: string | undefined
  run: (input: I) => Promise<AuthFlowResult<{ redirectTo: string }>>
  formData?: FormData
}) {
  const formData = providedFormData ?? (await request.formData())
  const values: Record<string, FormDataEntryValue | null> = {}
  for (const field of fields) {
    values[field] = formData.get(field)
  }

  const parsed = schema.safeParse(values)
  if (!parsed.success) {
    return redirectTo === undefined ? { error: defaultErrorMessage } : { error: defaultErrorMessage, redirectTo }
  }

  const result = await run(parsed.data)
  if (!result.ok) {
    return data(redirectTo === undefined ? { error: result.message } : { error: result.message, redirectTo }, {
      headers: result.headers,
    })
  }

  throw redirect(result.data.redirectTo, { headers: result.headers })
}
