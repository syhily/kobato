import { sql } from 'drizzle-orm'

import type { AuthFlowResult } from '@/server/domains/auth/services/shared'
import type { BlogSession } from '@/server/domains/auth/session-storage'
import type { Database } from '@/server/infra/db/database'

import { establishLoginSession } from '@/server/domains/auth/primitives'
import { authFlowError } from '@/server/domains/auth/services/shared'
import { invalidateSetupToken } from '@/server/domains/auth/setup-token'
import { refreshBlogSettings } from '@/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@/server/domains/settings/services/install-flow'
import { hasAdmin, hashAdminPassword, insertAdmin } from '@/server/infra/db/operations/user'
import { descriptorFor } from '@/server/infra/http/error-descriptor'
import { DomainError } from '@/server/infra/http/errors'
import { idFromString } from '@/shared/utils/id'

export interface SignUpAdminSeed {
  title: string
  name: string
  email: string
  password: string
}

export async function signUpInitialAdminWithSession(
  db: Database,
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
    return authFlowError('auth.setup.error.adminExists')
  }

  // Settings domain owns the section seed; the admin insert and seed
  // share one transaction so a fresh install commits or rolls back atomically.
  const seedRows = buildInstallSectionRows({ title, name, email, hostname: new URL(request.url).hostname })
  if (!seedRows.ok) {
    // Registry-drift diagnostic: the technical seed message rides as the
    // fallback, the structured copy is the setup validation descriptor.
    const descriptor = seedRows.descriptor
    return { type: 'error', message: descriptor.fallbackMessage, descriptor }
  }

  // bcrypt stays outside the transaction: node:sqlite transactions are sync.
  const hashedPassword = await hashAdminPassword(password)
  const admin = db.transaction((tx) => {
    const users = insertAdmin(tx, name, email, hashedPassword)
    const admin = users[0]
    if (!admin) {
      throw new DomainError('INTERNAL', descriptorFor('auth.setup.error.createAdminFailed'))
    }
    seedInstallSections(tx, seedRows.rows, idFromString(admin.id))
    return admin
  })

  const established = await establishLoginSession(db, session, admin, request, clientAddress)

  await refreshBlogSettings(db)
  await invalidateSetupToken(db)

  // Bulk-load install seed — refresh planner statistics (plan §1.9).
  db.run(sql`ANALYZE`)

  return {
    type: 'redirect',
    to: '/admin',
    setCookie: established.setCookie,
  }
}
