import type { BlogSettingsBundle, SecretMasks } from '@kobato/shared/config/types'

import { backfillSettingsSections, hydrateBlogSettings } from '@kobato/server/domains/settings/services/hydrate'
import { computeSecretMasks, redactSecretsFromBundle } from '@kobato/server/domains/settings/services/masks'
import { getSupportedTimeZones } from '@kobato/server/domains/settings/timezones'
import { getRequestContext } from '@kobato/server/http/request-context'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast'
import { isRouteErrorResponse, Outlet, useOutletContext, useRouteError } from 'react-router'

import type { Route } from './+types/layout'

interface ParentContext {
  currentUser: { id: string; name: string; email: string }
}

/**
 * Bundle shape downstream settings routes consume. Every section is
 * narrowed to NonNullable here because the loader below enforces the
 * invariant once — deleting ~12 identical `bundle.<section> === null`
 * 503 guards from the per-section routes.
 */
export type SettingsBundle = {
  [K in keyof BlogSettingsBundle]-?: NonNullable<BlogSettingsBundle[K]>
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
// Defensive 503 lives here ONCE: a missing `siteIdentity` / `assets` row
// means the install never completed, and any other missing section means
// an admin truncated a row by hand. Owning the guard at this layer lets
// every per-section route trust the bundle is fully populated.
function assertSettingsBundle(value: Record<string, unknown>): asserts value is SettingsBundle {
  const missing = Object.entries(value)
    .filter(([, v]) => v === null)
    .map(([k]) => k)
  if (missing.length > 0) {
    throw new Response(
      `设置数据不完整，缺少以下 section：${missing.join('、')}。` +
        '安装流程本应写入所有设置行，因此这通常意味着某行被手动删除。请重新运行安装流程或从备份还原。',
      { status: 503 },
    )
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { db } = getRequestContext({ request, context })
  const bundle = await hydrateBlogSettings(db)
  if (bundle === null) {
    throw new Response('站点尚未完成安装。', { status: 503 })
  }

  // Eager backfill: any section that is null but carries registry defaults
  // gets written to DB and populated in the bundle copy before we check.
  // This prevents newly-added optional sections (e.g. backup) from breaking
  // the entire admin panel on existing deployments whose DB predates them.
  const mutable = await backfillSettingsSections(db, bundle)

  assertSettingsBundle(mutable)
  const masks = computeSecretMasks(unsafeCast<BlogSettingsBundle>(mutable))
  const redacted = unsafeCast<SettingsBundle>(redactSecretsFromBundle(unsafeCast<BlogSettingsBundle>(mutable)))
  return {
    bundle: redacted,
    timeZones: getSupportedTimeZones(),
    masks,
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
