import { isOnSiteOrigin, parseAssetUrlPath, type ParsedAssetUrl } from '@kobato/assets/asset-url'
import { descriptorFor } from '@kobato/server/infra/http/error-descriptor'
import { ActionFailure } from '@kobato/server/infra/http/errors'
import { requireBlogSettingsSection } from '@kobato/settings/getters'

export function getPublicBaseUrl(): string | null {
  const assets = requireBlogSettingsSection('assets')
  const host = assets.asset.host.trim()
  if (host === '') {
    return null
  }
  return `${assets.asset.scheme}://${trimTrailingSlash(host)}`
}

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
  route?: string
  stripPrefix?: string
}

export function resolveAssetUrl(storagePath: string, updatedAtMs?: number, options?: ResolveAssetUrlOptions): string {
  const website = getGeneralWebsite()
  if (website === '') {
    throw new ActionFailure(503, descriptorFor('storage.error.siteUrlMissing'))
  }
  let key = trimLeadingSlash(storagePath)
  if (options?.stripPrefix !== undefined && key.startsWith(options.stripPrefix)) {
    key = key.slice(options.stripPrefix.length)
  }
  const route = options?.route ?? '/storage/'
  return appendVersion(`${website}${route}${key}`, updatedAtMs)
}

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

export interface ParseAssetUrlOptions {
  siteOrigin?: string
  anyOrigin?: boolean
}

function stripQueryAndFragment(url: string): string {
  const cut = url.search(/[?#]/)
  return cut === -1 ? url : url.slice(0, cut)
}

export function parseAssetUrl(url: string, options: ParseAssetUrlOptions = {}): ParsedAssetUrl | null {
  if (url.startsWith('/') && !url.startsWith('//')) {
    return parseAssetUrlPath(stripQueryAndFragment(url))
  }
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return null
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (options.anyOrigin !== true) {
    const siteOrigin = options.siteOrigin
    if (siteOrigin === undefined || siteOrigin === '' || !isOnSiteOrigin(parsed, siteOrigin)) {
      return null
    }
  }
  return parseAssetUrlPath(parsed.pathname)
}
