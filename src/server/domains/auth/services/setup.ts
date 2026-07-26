// Initial-setup flow — create the first admin and seed every settings
// section in one transaction, then establish the session.

import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Pool } from 'pg'

import type { AuthFlowResult } from '@/server/domains/auth/services/shared'
import type { BlogSession } from '@/server/domains/auth/session-storage'

import { establishLoginSession } from '@/server/domains/auth/primitives'
import { invalidateSetupToken } from '@/server/domains/auth/setup-token'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
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

  // Composition only: the settings domain owns the section seed
  // (`services/install-flow` builds and validates all 18 rows); here the
  // admin insert and the seed share one transaction so a fresh install
  // commits — or rolls back — atomically.
  const seedRows = buildInstallSectionRows({ title, name, email, hostname: new URL(request.url).hostname })
  if (!seedRows.ok) {
    return {
      type: 'error',
      message: seedRows.message,
    }
  }

  const admin = await db.transaction(async (tx) => {
    const users = await insertAdmin(tx, name, email, password)
    const admin = users[0]
    if (!admin) {
      throw new DomainError('INTERNAL', '创建管理员账号失败')
    }
    await seedInstallSections(tx, seedRows.rows, idFromString(admin.id))
    return admin
  })

  const established = await establishLoginSession(db, session, admin, request, clientAddress)

  await refreshBlogSettings(db)
  await invalidateSetupToken(db)

  return {
    type: 'redirect',
    to: '/admin',
    setCookie: established.setCookie,
  }
}
