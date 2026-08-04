import type { Database } from '@kobato/server/infra/db/database'

import { hasAdmin } from '@kobato/server/infra/db/operations/user'
import { redirect } from 'react-router'

// Gate that decides whether the deployment is "installed".
//
// After the one-step install migration, user creation and settings seeding
// are atomic — so "has admin" is equivalent to "installed". The gate
// collapses from three states to two:
//
//   noAdmin   — no admin user exists. `/admin/setup` is the only valid URL.
//   installed — admin (and therefore settings) exist. Normal auth flow.

export type InstallState = 'noAdmin' | 'installed'

/**
 * Cheap installation check shared by the gate middleware and by the
 * install / login routes.
 *
 * No memoization — every call queries `hasAdmin(db)` directly (a cheap
 * SELECT COUNT at blog scale). Do not re-wrap in `React.cache()`:
 * outside React Server Components `cache()` is a pure pass-through, so
 * the dedup never happens.
 */
export async function getInstallState(db: Database): Promise<InstallState> {
  if (!(await hasAdmin(db))) {
    return 'noAdmin'
  }
  return 'installed'
}

/**
 * Convenience: `true` iff the deployment has finished installing.
 */
export async function isInstalled(db: Database): Promise<boolean> {
  return (await getInstallState(db)) === 'installed'
}

/**
 * Loader/action helper for `/admin/setup`.
 *
 *   noAdmin   → resolve, render the admin-credentials form.
 *   installed → throw 303 → `/admin/signin`.
 */
export async function ensureNoAdminOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    return null
  }
  throw redirect('/admin/signin', { status: 303 })
}

/**
 * Loader/action helper for `/admin/signin`.
 *
 *   noAdmin   → throw 303 → `/admin/setup` (nothing to log into yet).
 *   installed → resolve, render the login form.
 */
export async function ensureInstalledOrRedirect(db: Database): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  return null
}
