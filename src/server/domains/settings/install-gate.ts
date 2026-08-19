import { redirect } from 'react-router'

import type { Database } from '@/server/infra/db/database'

import { hasAdmin } from '@/server/infra/db/operations/user'

// Gate that decides whether the deployment is "installed": "has admin" is
// equivalent to "installed" (user creation and settings seeding are atomic).

export type InstallState = 'noAdmin' | 'installed'

/**
 * Cheap installation check shared by the gate middleware and the install / login routes.
 * Not memoized — do not re-wrap in `React.cache()` (a pure pass-through outside RSC).
 */
export async function getInstallState(db: Database): Promise<InstallState> {
  if (!(await hasAdmin(db))) {
    return 'noAdmin'
  }
  return 'installed'
}

/** Loader/action helper for `/admin/setup`. */
export async function ensureNoAdminOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    return null
  }
  throw redirect('/admin/signin', { status: 303 })
}

/** Loader/action helper for `/admin/signin`. */
export async function ensureInstalledOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  return null
}
