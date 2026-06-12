import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { AuthFlowResult } from '@/server/domains/auth/otp-flow'
import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { SettingsSection } from '@/shared/config/sections'
import type { AssetsSettings, SiteIdentitySettings } from '@/shared/config/types'

import { establishLoginSession } from '@/server/domains/auth/primitives'
import { invalidateSetupToken } from '@/server/domains/auth/setup-token'
import { ASSETS_STORAGE_INSTALL_DEFAULTS } from '@/server/domains/settings/sections/defaults'
import { buildDefaultSectionPayloads, SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { upsertSetting } from '@/server/infra/db/operations/setting'
import { hasAdmin, insertAdmin } from '@/server/infra/db/operations/user'
import { DomainError } from '@/server/infra/http/errors'
import { idFromString } from '@/shared/utils/id'

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
): Promise<AuthFlowResult> {
  if (await hasAdmin(db)) {
    return {
      type: 'error',
      message: '管理员账号已存在，请直接登录后继续初始化。',
    }
  }

  // ── Seed all settings sections in one pass ──
  const hostname = new URL(request.url).hostname
  const siteIdentity: SiteIdentitySettings = {
    title,
    description: 'Welcome',
    website: `https://${hostname}`,
    keywords: [],
    author: { name, email, url: `https://${hostname}` },
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
  const parsedSections: { payload: Record<string, unknown>; scope: string }[] = []
  for (const { section, payload } of sections) {
    const meta = SECTION_REGISTRY[section]
    const check = meta.schema.safeParse(payload)
    if (!check.success) {
      const first = check.error.issues[0]
      const path = first ? first.path.join('.') : '<unknown>'
      return {
        type: 'error',
        message: `${meta.scope} 校验失败（${path}）：${first?.message ?? '未知错误'}`,
      }
    }
    parsedSections.push({ payload: check.data as Record<string, unknown>, scope: meta.scope })
  }

  const admin = await db.transaction(async (tx) => {
    const users = await insertAdmin(tx, name, email, password)
    const admin = users[0]
    if (!admin) {
      throw new DomainError('INTERNAL', '创建管理员账号失败')
    }
    const updatedBy = idFromString(admin.id)
    for (const { payload, scope } of parsedSections) {
      await upsertSetting(tx, payload, updatedBy, scope)
    }
    return admin
  })

  const established = await establishLoginSession(db, session, admin, request, clientAddress)

  await refreshBlogSettings(db)
  await invalidateSetupToken()

  return {
    type: 'redirect',
    to: '/admin',
    setCookie: established.setCookie,
  }
}
