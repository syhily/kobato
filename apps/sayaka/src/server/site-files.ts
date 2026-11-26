import type { BlogSettingsBundle } from '@kobato/settings/types'

import { brandingVersionSuffix } from '@kobato/settings/presentation'
import { createHash } from 'node:crypto'

const ASSET_CACHE_CONTROL = 'public, max-age=3600, must-revalidate'
const MANIFEST_CACHE_CONTROL = 'public, no-cache'
const REDIRECT_CACHE_CONTROL = 'public, max-age=86400, s-maxage=604800, immutable'
const DEFAULT_MANIFEST_NAME = 'Site'

function contentEtag(content: string): string {
  const hash = createHash('sha1')
  hash.update(content)
  return `"${hash.digest('hex').slice(0, 32)}"`
}

function etagHeaderMatches(header: string | null | undefined, etag: string): boolean {
  if (header === null || header === undefined) {
    return false
  }
  const target = etag.startsWith('W/') ? etag.slice(2) : etag
  return header.split(',').some((raw) => {
    const candidate = raw.trim()
    if (candidate === '*') {
      return true
    }
    const comparable = candidate.startsWith('W/') ? candidate.slice(2) : candidate
    return candidate !== '' && comparable === target
  })
}

export function tagsRedirectResponse(): Response {
  return new Response(null, {
    status: 301,
    headers: {
      'Cache-Control': REDIRECT_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=UTF-8',
      Location: '/',
    },
  })
}

export function searchRedirectResponse(query: string | undefined): Response {
  const keyword = query?.trim() ?? ''
  return new Response(null, {
    status: 301,
    headers: {
      'Cache-Control': REDIRECT_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=UTF-8',
      Location: keyword ? `/search/${encodeURIComponent(keyword)}` : '/',
    },
  })
}

export function robotsTxtResponse(bundle: BlogSettingsBundle | null): Response {
  const custom = bundle?.assets?.branding?.robotsTxt
  let body: string
  if (typeof custom === 'string' && custom.length > 0) {
    body = custom
  } else {
    const website = bundle?.siteIdentity?.website ?? ''
    body = website ? `User-agent: *\nAllow: /\nSitemap: ${website}/sitemap.xml` : 'User-agent: *\nAllow: /\n'
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': ASSET_CACHE_CONTROL,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  })
}

export function manifestResponse(
  bundle: BlogSettingsBundle | null,
  locale: string,
  ifNoneMatch: string | undefined,
): Response {
  const siteIdentity = bundle?.siteIdentity
  const name = siteIdentity?.title || DEFAULT_MANIFEST_NAME
  const branding = bundle?.assets?.branding
  const body = JSON.stringify({
    name,
    short_name: name,
    lang: locale,
    icons: [
      {
        src: `/images/icon-192.png${brandingVersionSuffix(branding?.icon192)}`,
        type: 'image/png',
        sizes: '192x192',
      },
      {
        src: `/images/icon-512.png${brandingVersionSuffix(branding?.icon512)}`,
        type: 'image/png',
        sizes: '512x512',
      },
    ],
    display: 'standalone',
    theme_color: '#ffffff',
    background_color: '#ffffff',
  })
  const etag = contentEtag(body)
  if (etagHeaderMatches(ifNoneMatch, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        'Cache-Control': MANIFEST_CACHE_CONTROL,
        'Content-Language': locale,
        'Content-Type': 'application/json; charset=utf-8',
        ETag: etag,
      },
    })
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Cache-Control': MANIFEST_CACHE_CONTROL,
      'Content-Language': locale,
      'Content-Type': 'application/json; charset=utf-8',
      ETag: etag,
    },
  })
}
