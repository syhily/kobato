import type { SecretMasks, SettingsBundle } from '@kobato/settings/types.ts'

import { createSsrCaller } from '@kobato/server/http/ssr-caller.ts'
import { useI18n } from '@kobato/ui/lib/I18nProvider.tsx'
import { ORPCError } from '@orpc/server'
import { isRouteErrorResponse, Outlet, useOutletContext, useRouteError } from 'react-router'

import type { Route } from './+types/layout'

interface ParentContext {
  currentUser: { id: string; name: string; email: string }
}

export interface SettingsOutletContext extends ParentContext {
  bundle: SettingsBundle
  timeZones: readonly string[]
  masks: SecretMasks
}

// Single loader read shared by every section route; saves don't revalidate it — cards adopt the authoritative
// save response as their baseline. The 503 guard lives once in `admin.settings.bootstrap`; this loader only
// translates it back to the thrown Response.
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

export function ErrorBoundary() {
  const { t } = useI18n()
  const error = useRouteError()
  const title = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : t('admin.settings.layout.loadFailed')
  const message = isRouteErrorResponse(error)
    ? typeof error.data === 'string'
      ? error.data
      : error.statusText
    : error instanceof Error
      ? error.message
      : t('admin.shell.error.unknown')

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
