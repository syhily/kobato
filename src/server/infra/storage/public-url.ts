import { ActionFailure } from '@/server/infra/http/errors'
import { requireBlogSettingsSection } from '@/shared/config/getters'

/**
 * Public base URL for S3 assets, or `null` when unconfigured. Stays non-null
 * while the upload toggle is OFF so existing `s3` rows keep rendering. This is
 * the 302 TARGET for the site-owned `/storage/*` routes — asset URLs stored
 * in content never carry it.
 */
export function getPublicBaseUrl(): string | null {
  const assets = requireBlogSettingsSection('assets')
  const host = assets.asset.host.trim()
  if (host === '') {
    return null
  }
  return `${assets.asset.scheme}://${trimTrailingSlash(host)}`
}

/** Canonical site origin; base for every site-owned asset URL. */
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
   * Site route override (leading + trailing slash required); `stripPrefix`
   * drops a matching storage-key prefix first. Driver-neutral: the route
   * shape (e.g. `/fonts/embedded/`) applies no matter where the bytes live.
   */
  route?: string
  stripPrefix?: string
}

/**
 * Site-owned absolute URL for a stored asset: `${website}/storage/<key>`
 * (or `options.route`), so a storage-backend switch never breaks stored
 * links — the `/storage/*` route 302s to the current backend when S3 is
 * active. Throws 503 when the site origin is unset; appends `?v=<updatedAtMs>`.
 */
export function resolveAssetUrl(storagePath: string, updatedAtMs?: number, options?: ResolveAssetUrlOptions): string {
  const website = getGeneralWebsite()
  if (website === '') {
    throw new ActionFailure(503, '请先在 /admin/settings/general 配置站点网址（siteIdentity.website）')
  }
  let key = trimLeadingSlash(storagePath)
  if (options?.stripPrefix !== undefined && key.startsWith(options.stripPrefix)) {
    key = key.slice(options.stripPrefix.length)
  }
  const route = options?.route ?? '/storage/'
  return appendVersion(`${website}${route}${key}`, updatedAtMs)
}

/** Null-safe variant: `null` instead of `ActionFailure` when the site origin is unset. */
export function safeResolveAssetUrl(storagePath: string, updatedAtMs?: number): string | null {
  try {
    return resolveAssetUrl(storagePath, updatedAtMs)
  } catch (error) {
    if (error instanceof ActionFailure) {
      return null
    }
    throw error
  }
}
