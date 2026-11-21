import type { Database } from '@kobato/db/database'
import type { AuthFlowResult } from '@kobato/server/domains/auth/services/shared'
import type { BlogSession } from '@kobato/server/domains/auth/session-storage'

import { analyzeDatabase } from '@kobato/db/operations/maintenance'
import { hasAdmin, hashAdminPassword, insertAdmin } from '@kobato/db/operations/user'
import { DEFAULT_LOCALE, type AppLocale } from '@kobato/i18n/locales'
import { establishLoginSession } from '@kobato/server/domains/auth/primitives'
import { authFlowError } from '@kobato/server/domains/auth/services/shared'
import { invalidateSetupToken } from '@kobato/server/domains/auth/setup-token'
import { refreshBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { buildInstallSectionRows, seedInstallSections } from '@kobato/server/domains/settings/services/install-flow'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { DomainError } from '@kobato/server/infra/http/errors'
import { idFromString } from '@kobato/utils/id'

export interface SignUpAdminSeed {
  title: string
  name: string
  email: string
  password: string
  locale?: AppLocale
}

export async function signUpInitialAdminWithSession(
  db: Database,
  {
    title,
    name,
    email,
    password,
    locale = DEFAULT_LOCALE,
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

  const seedRows = buildInstallSectionRows({ title, name, email, locale, hostname: new URL(request.url).hostname })
  if (!seedRows.ok) {
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

  analyzeDatabase(db)

  return {
    type: 'redirect',
    to: '/admin',
    setCookie: established.setCookie,
  }
}
