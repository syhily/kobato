import type { BlogSettingsBundle } from '@kobato/settings/types'

export interface CspInput {
  bundle: BlogSettingsBundle | null
  nonce: string
  isDev: boolean
}

export function buildCspHeader({ bundle, nonce, isDev }: CspInput): string {
  const origins = new Set<string>()
  const asset = bundle?.assets?.asset
  if (asset?.host) {
    origins.add(`${asset.scheme ?? 'https'}://${asset.host}`)
  }
  const extra = origins.size > 0 ? ' ' + [...origins].join(' ') : ''
  const website = bundle?.siteIdentity?.website
  const siteOrigin = website ? URL.parse(website)?.origin : undefined
  const mediaExtra = siteOrigin && !origins.has(siteOrigin) ? `${extra} ${siteOrigin}` : extra
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline'" : `script-src 'self' 'nonce-${nonce}'`
  const workerSrc = isDev ? "worker-src 'self' blob:" : "worker-src 'self'"
  const devMediaExtra = isDev ? `${mediaExtra} https:` : mediaExtra
  const directives = [
    "default-src 'self'",
    scriptSrc,
    workerSrc,
    `style-src 'self' 'unsafe-inline' ${extra}`,
    `font-src 'self' ${extra}`,
    `img-src 'self' data: blob: ${devMediaExtra}`,
    `media-src 'self' ${devMediaExtra}`,
    "connect-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ]
  if (siteUsesHttps(bundle)) {
    directives.push('upgrade-insecure-requests')
  }
  return directives.join('; ')
}

export function siteUsesHttps(bundle: BlogSettingsBundle | null): boolean {
  return URL.parse(bundle?.siteIdentity?.website ?? '')?.protocol === 'https:'
}
