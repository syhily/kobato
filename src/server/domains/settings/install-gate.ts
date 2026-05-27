import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { cache } from 'react'
import { redirect } from 'react-router'

import { hasAdmin } from '@/server/infra/db/operations/user'

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
 * Cheap, snapshot-backed installation check shared by the gate and by
 * the install / login routes.
 *
 * Wrapped in `React.cache` so the `installGateMiddleware` and any
 * downstream loader (`/admin/setup`, `/admin/signin`) that calls
 * `ensure…OrRedirect()` share a single resolution per render pass.
 */
export const getInstallState = cache(async function getInstallState(db: NodePgDatabase): Promise<InstallState> {
  if (!(await hasAdmin(db))) {
    return 'noAdmin'
  }
  return 'installed'
})

/**
 * Convenience: `true` iff the deployment has finished installing.
 */
export async function isInstalled(db: NodePgDatabase): Promise<boolean> {
  return (await getInstallState(db)) === 'installed'
}

/**
 * Loader/action helper for `/admin/setup`.
 *
 *   noAdmin   → resolve, render the admin-credentials form.
 *   installed → throw 303 → `/admin/signin`.
 */
export async function ensureNoAdminOrRedirect(db: NodePgDatabase): Promise<null> {
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
export async function ensureInstalledOrRedirect(db: NodePgDatabase): Promise<null> {
  const state = await getInstallState(db)
  if (state === 'noAdmin') {
    throw redirect('/admin/setup', { status: 303 })
  }
  return null
}
