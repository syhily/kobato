import type { Database } from '@kobato/db/sqlite/database'

import { hasAdmin } from '@kobato/db/sqlite/operations/identity/user'
import { redirect } from 'react-router'

export type InstallState = 'noAdmin' | 'installed'

export async function getInstallState(db: Database): Promise<InstallState> {
  if (!(await hasAdmin(db))) {
    return 'noAdmin'
  }
  return 'installed'
}

export async function ensureNoAdminOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    return null
  }
  throw redirect('/admin/signin', { status: 303 })
}

export async function ensureInstalledOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  return null
}
