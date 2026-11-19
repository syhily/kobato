import type { HeadersFunction } from 'react-router'

export const CACHE_PROFILES = {
  listing: 'private, no-cache',
  detail: 'private, no-cache',
  imageImmutable: 'public, max-age=86400, immutable',
} as const

const REPRESENTATION_HEADERS = ['ETag', 'Content-Language', 'Cache-Control', 'Vary'] as const

export const documentHeaders: HeadersFunction = ({ parentHeaders, errorHeaders }) => {
  const headers = new Headers(parentHeaders)
  if (errorHeaders !== undefined) {
    for (const name of REPRESENTATION_HEADERS) {
      const value = errorHeaders.get(name)
      if (value !== null) {
        headers.set(name, value)
      }
    }
  }
  return headers
}

export function cacheHeaders(profile: keyof typeof CACHE_PROFILES): HeadersFunction {
  return ({ loaderHeaders }) => {
    const headers = new Headers()
    const etag = loaderHeaders.get('ETag')
    if (etag !== null) {
      headers.set('ETag', etag)
    }
    const contentLanguage = loaderHeaders.get('Content-Language')
    if (contentLanguage !== null) {
      headers.set('Content-Language', contentLanguage)
    }
    headers.set('Cache-Control', loaderHeaders.get('Cache-Control') ?? CACHE_PROFILES[profile])
    headers.set('Vary', 'Cookie')
    return headers
  }
}
