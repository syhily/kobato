import type { StorageDriver } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'

/**
 * Public base URL the runtime joins with `<storagePath>` to compute
 * public asset URLs for **S3** assets (images, music, etc.).
 *
 * Returns the configured bucket URL even when the upload toggle is OFF —
 * that lets the SSR enhancer keep rendering existing `s3` rows after an
 * admin disables further uploads. Returns `null` when the section is
 * unconfigured (no `publicBaseUrl` to join with).
 */
export function getPublicBaseUrl(): string | null {
  const assets = requireBlogSettingsSection('assets')
  const host = assets.asset.host.trim()
  if (host === '') {
    return null
  }
  return `${assets.asset.scheme}://${trimTrailingSlash(host)}`
}

/**
 * The site's canonical origin (e.g. `https://yufan.me`), used as the base
 * for **local** assets served through the app's own `/storage/*` route.
 * Local storage needs no extra configuration — this URL is already a
 * required field in the general settings.
 */
export function getGeneralWebsite(): string {
  return trimTrailingSlash(requireBlogSettingsSection('siteIdentity').website)
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

function trimLeadingSlash(value: string): string {
  return value.startsWith('/') ? value.slice(1) : value
}

function appendVersion(url: string, version: number | undefined): string {
  if (version === undefined) {
    return url
  }
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}v=${version}`
}

export interface ResolveAssetUrlOptions {
  /**
   * Route override for the `local` driver. Local assets default to the
   * generic `/storage/<storagePath>` route; a dedicated public route (e.g.
   * the self-hosted font route) claims the asset instead by passing its URL
   * prefix as `route` (leading + trailing slash required). When the route
   * already implies a leading storage-key prefix, `stripPrefix` drops it
   * from the key first. Ignored for the `s3` driver — the bucket serves the
   * raw storage key either way.
   */
  local?: {
    route: string
    stripPrefix?: string
  }
}

/**
 * Resolve the absolute public URL for a stored object, dispatching on the
 * per-asset `driver`:
 *
 *  - `s3`    → `<publicBaseUrl>/<storagePath>` — served directly by the
 *              bucket/CDN. Throws `ActionFailure(503)` when the CDN host
 *              is unset (matches the historical `buildPublicUrl`).
 *  - `local` → `<generalWebsite>/storage/<storagePath>` — served by the
 *              app's public `/storage/*` route, unless `options.local`
 *              overrides the route (see `ResolveAssetUrlOptions`). Throws
 *              `ActionFailure(503)` when the site origin is unset; a
 *              relative URL would break in RSS / OG / email contexts that
 *              need an absolute URL.
 *
 * Both shapes append `?v=<updatedAtMs>` for cache busting when provided.
 */
export function resolveAssetUrl(
  driver: StorageDriver,
  storagePath: string,
  updatedAtMs?: number,
  options?: ResolveAssetUrlOptions,
): string {
  if (driver === 'local') {
    const website = getGeneralWebsite()
    if (website === '') {
      throw new ActionFailure(503, '请先在 /admin/settings/general 配置站点网址（siteIdentity.website）')
    }
    let key = trimLeadingSlash(storagePath)
    const local = options?.local
    if (local?.stripPrefix !== undefined && key.startsWith(local.stripPrefix)) {
      key = key.slice(local.stripPrefix.length)
    }
    const route = local?.route ?? '/storage/'
    return appendVersion(`${website}${route}${key}`, updatedAtMs)
  }
  const publicBaseUrl = getPublicBaseUrl()
  if (publicBaseUrl === null) {
    throw new ActionFailure(503, '请先在 /admin/settings/assets 配置 S3 公共访问基地址')
  }
  return appendVersion(`${publicBaseUrl}/${trimLeadingSlash(storagePath)}`, updatedAtMs)
}

/**
 * Null-safe variant: returns `null` instead of throwing when an S3 asset's
 * CDN base is unset. Used by SSR/list renderers that must degrade gracefully.
 */
export function safeResolveAssetUrl(driver: StorageDriver, storagePath: string, updatedAtMs?: number): string | null {
  try {
    return resolveAssetUrl(driver, storagePath, updatedAtMs)
  } catch (error) {
    if (error instanceof ActionFailure) {
      return null
    }
    throw error
  }
}
