import type { GifSettings } from '@/context/InklingHostIntegrationContext'

const PROVIDER_API_URLS: Record<string, string> = {
  klipy: 'https://api.klipy.com',
  tenor: 'https://tenor.googleapis.com',
}

export const ERROR_TYPE: Record<string, string> = {
  COMMON: 'common',
  INVALID_API_KEY: 'invalid_key',
}

export interface GifProviderConfig {
  provider: string
  apiUrl: string
  apiKey: string
  contentFilter: string
}

export function getGifProviderConfig(cardConfig: GifSettings | null | undefined): GifProviderConfig | null {
  if (cardConfig?.klipy?.apiKey) {
    return {
      provider: 'klipy',
      apiUrl: PROVIDER_API_URLS.klipy,
      apiKey: cardConfig.klipy.apiKey,
      contentFilter: cardConfig.klipy.contentFilter || 'off',
    }
  }
  if (cardConfig?.tenor?.googleApiKey) {
    return {
      provider: 'tenor',
      apiUrl: PROVIDER_API_URLS.tenor,
      apiKey: cardConfig.tenor.googleApiKey,
      contentFilter: cardConfig.tenor.contentFilter || 'off',
    }
  }
  return null
}

export interface GifErrorResponse {
  error?: { message?: string } | string
  errors?: { message?: string[] | string }
}

export function extractErrorMessage(json: unknown): string {
  if (typeof json !== 'object' || json === null) {
    return 'Unknown error'
  }
  const err: unknown = 'error' in json ? json.error : undefined
  const klipyMessage: unknown =
    'errors' in json && typeof json.errors === 'object' && json.errors !== null && 'message' in json.errors
      ? json.errors.message
      : undefined
  return (
    (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string' && err.message) ||
    (typeof err === 'string' ? err : '') ||
    (Array.isArray(klipyMessage) && typeof klipyMessage[0] === 'string'
      ? klipyMessage[0]
      : typeof klipyMessage === 'string'
        ? klipyMessage
        : undefined) ||
    'Unknown error'
  )
}

/** One result entry: `media_formats` must be an object, and a present `tinygif` must carry a [width, height] pair. */
function isGifResultItem(item: unknown): boolean {
  if (typeof item !== 'object' || item === null || !('media_formats' in item)) {
    return false
  }
  const mediaFormats: unknown = item.media_formats
  if (typeof mediaFormats !== 'object' || mediaFormats === null) {
    return false
  }
  const tinygif: unknown = 'tinygif' in mediaFormats ? mediaFormats.tinygif : undefined
  if (tinygif === undefined || tinygif === null) {
    // only the full gif format is fine — tinygif is a layout hint, not a requirement
    return true
  }
  if (typeof tinygif !== 'object' || !('dims' in tinygif)) {
    return false
  }
  const dims: unknown = tinygif.dims
  return Array.isArray(dims) && dims.length === 2
}

/** The provider's success payload — untyped network data is checked at the fetch boundary, not asserted. */
export function isGifResponse(json: unknown): json is GifResponse {
  return (
    typeof json === 'object' &&
    json !== null &&
    'results' in json &&
    Array.isArray(json.results) &&
    json.results.every(isGifResultItem)
  )
}

export function isInvalidKeyError(message: string | null | undefined): boolean {
  const text = message || ''
  return /api key/i.test(text) && /(invalid|not valid)/i.test(text)
}

interface MediaFormat {
  dims: [number, number]
  url?: string
}

export interface GifData {
  id: string
  media_formats: {
    tinygif?: MediaFormat
    gif?: MediaFormat
  }
  ratio?: number
  index?: number
  columnIndex?: number
  columnRowIndex?: number
  [key: string]: unknown
}

export interface GifResponse {
  results: GifData[]
  next?: string
}
