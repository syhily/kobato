import { ORPCError } from '@orpc/server'
import { isRouteErrorResponse, Outlet, useOutletContext, useRouteError } from 'react-router'

import type { SecretMasks, SettingsBundle } from '@/shared/config/types'

import { createSsrCaller } from '@/server/http/ssr-caller'

import type { Route } from './+types/layout'

interface ParentContext {
  currentUser: { id: string; name: string; email: string }
}

export interface SettingsOutletContext extends ParentContext {
  /**
   * Bucketed settings document straight from the storage layer. Each
   * field maps 1:1 to a `setting('blog.<section>')` row, so a save to
   * one section never re-shapes another section's bucket. Every bucket
   * is non-null (enforced by the layout loader). Secrets are redacted
   * (empty strings) — use `masks` for UI hints.
   */
  bundle: SettingsBundle
  /**
   * Canonical IANA timezone list shared by every settings section that
   * renders a timezone picker (currently only the general form).
   * Resolved once at module load by `@/server/domains/settings/timezones` so
   * we pay the `Intl.supportedValuesOf` cost once per process.
   */
  timeZones: readonly string[]
  /**
   * Pre-computed secret masks so the admin UI can show "…last4" hints
   * without receiving the actual plaintext keys.
   */
  masks: SecretMasks
}

// Single loader read shared by every section route below the shell. The
// snapshot is small; saves deliberately do NOT revalidate it — each card
// adopts the authoritative save response as its new baseline instead (see
// `useSettingsMutation`), so this loader only re-runs on navigation.
//
// The defensive 503 lives in the `admin.settings.bootstrap` procedure
// ONCE: a missing `siteIdentity` / `assets` row means the install never
// completed, and any other missing section means an admin truncated a
// row by hand (SERVICE_UNAVAILABLE carries the exact historical texts).
// Owning the guard there lets every per-section route trust the bundle
// is fully populated; this loader only translates the code back into
// the thrown Response.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { caller } = createSsrCaller({ request, context })
  try {
    return await caller.admin.settings.bootstrap()
  } catch (error) {
    if (error instanceof ORPCError && error.code === 'SERVICE_UNAVAILABLE') {
      throw new Response(error.message, { status: 503 })
    }
    throw error
  }
}

// Render section errors inside a simple card so the admin chrome survives.
export function ErrorBoundary() {
  const error = useRouteError()
  const title = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : '设置加载失败'
  const message = isRouteErrorResponse(error)
    ? typeof error.data === 'string'
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : '未知错误'

  return (
    <div className="flex min-h-admin-content-min items-start justify-center pt-20">
      <div className="w-full max-w-lg space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-lg font-semibold text-destructive">{title}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

export default function AdminSettingsLayoutRoute({ loaderData }: Route.ComponentProps) {
  const parent = useOutletContext<ParentContext>()
  const context: SettingsOutletContext = {
    ...parent,
    bundle: loaderData.bundle,
    timeZones: loaderData.timeZones,
    masks: loaderData.masks,
  }
  return <Outlet context={context} />
}
