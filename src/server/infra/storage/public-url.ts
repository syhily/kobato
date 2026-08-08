import type { StorageDriver } from '@/shared/config/types'

import { ActionFailure } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'

/**
 * Public base URL for S3 assets, or `null` when unconfigured. Stays non-null
 * while the upload toggle is OFF so existing `s3` rows keep rendering.
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
 * Canonical site origin; base for **local** assets served via `/storage/*`.
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
   * Route override for the `local` driver (leading + trailing slash required);
   * `stripPrefix` drops a matching storage-key prefix first.
   */
  local?: {
    route: string
    stripPrefix?: string
  }
}

/**
 * Absolute public URL per driver (`s3` → CDN base; `local` → site origin or
 * `options.local.route`). Throws 503 when the base is unset; appends `?v=<updatedAtMs>`.
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

/** Null-safe variant: `null` instead of `ActionFailure` when the base is unset. */
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
