// Per-slot status surfaced to the admin form. `etag` is what the form
// uses for cache-busting in preview URLs (e.g. `/favicon.svg?v=<etag>`)
// and to detect "is configured?" in the read-only view. We send the
// hash, NOT the bytes, so the loader response stays tiny.
export interface BrandingSlotStatus {
  /** Empty string when the slot has no custom upload. */
  etag: string
}

export interface AssetsLoaderShape {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled: boolean
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    forcePathStyle: boolean
    urlTemplate: string
  }
  /** Last 4 chars of the stored secret access key, or `null` when unset. */
  secretAccessKeyMask: string | null
  upload: { maxBytes: number; jpegQuality: number }
  branding: {
    faviconSvg: BrandingSlotStatus
    faviconIco: BrandingSlotStatus
    appleTouchIcon: BrandingSlotStatus
    icon192: BrandingSlotStatus
    icon512: BrandingSlotStatus
    logoSvg: BrandingSlotStatus
    logoDarkSvg: BrandingSlotStatus
    logoLargeSvg: BrandingSlotStatus
    logoLargeDarkSvg: BrandingSlotStatus
    openGraph: BrandingSlotStatus
    blogPoster: BrandingSlotStatus
    blogPosterDark: BrandingSlotStatus
    defaultAvatar: BrandingSlotStatus
    /** robots.txt content (inline configuration, not an S3-backed asset). */
    robotsTxt: string
  }
}

export interface SearchLoaderShape {
  search: {
    enabled: boolean
    mode: 'vector' | 'like'
    endpoint: string
    apiKey: string
    model: string
    similarityThreshold: number
  }
  apiKeyMask: string | null
}

/**
 * Project the raw `AssetsSettings` (from the settings bundle) into the
 * shape `<AssetsForm>` expects, with secret masking and defaulted upload
 * limits. Kept in shared so route components can call it without
 * reaching into `server/`.
 */
interface RawBrandingRef {
  etag?: string
}

function statusOf(ref: RawBrandingRef | undefined | null): BrandingSlotStatus {
  return { etag: typeof ref?.etag === 'string' ? ref.etag : '' }
}

export function projectAssetsForAdmin(assets: {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled?: boolean
    endpoint?: string
    region?: string
    bucket?: string
    accessKeyId?: string
    secretAccessKey?: string
    forcePathStyle?: boolean
    urlTemplate?: string
  }
  upload: { maxBytes?: number; jpegQuality?: number }
  branding?: {
    faviconSvg?: RawBrandingRef
    faviconIco?: RawBrandingRef
    appleTouchIcon?: RawBrandingRef
    icon192?: RawBrandingRef
    icon512?: RawBrandingRef
    logoSvg?: RawBrandingRef
    logoDarkSvg?: RawBrandingRef
    logoLargeSvg?: RawBrandingRef
    logoLargeDarkSvg?: RawBrandingRef
    openGraph?: RawBrandingRef
    blogPoster?: RawBrandingRef
    blogPosterDark?: RawBrandingRef
    defaultAvatar?: RawBrandingRef
    robotsTxt?: string
  }
}): AssetsLoaderShape {
  const secretAccessKey = typeof assets.storage.secretAccessKey === 'string' ? assets.storage.secretAccessKey : ''
  const b = assets.branding ?? {}
  return {
    asset: { host: assets.asset.host, scheme: assets.asset.scheme },
    storage: {
      enabled: assets.storage.enabled === true,
      endpoint: assets.storage.endpoint ?? '',
      region: assets.storage.region ?? '',
      bucket: assets.storage.bucket ?? '',
      accessKeyId: '',
      forcePathStyle: assets.storage.forcePathStyle === true,
      urlTemplate: assets.storage.urlTemplate ?? '',
    },
    secretAccessKeyMask: secretAccessKey === '' ? null : secretAccessKey.slice(-4),
    upload: {
      maxBytes: assets.upload.maxBytes ?? 8 * 1024 * 1024,
      jpegQuality: assets.upload.jpegQuality ?? 82,
    },
    branding: {
      faviconSvg: statusOf(b.faviconSvg),
      faviconIco: statusOf(b.faviconIco),
      appleTouchIcon: statusOf(b.appleTouchIcon),
      icon192: statusOf(b.icon192),
      icon512: statusOf(b.icon512),
      logoSvg: statusOf(b.logoSvg),
      logoDarkSvg: statusOf(b.logoDarkSvg),
      logoLargeSvg: statusOf(b.logoLargeSvg),
      logoLargeDarkSvg: statusOf(b.logoLargeDarkSvg),
      openGraph: statusOf(b.openGraph),
      blogPoster: statusOf(b.blogPoster),
      blogPosterDark: statusOf(b.blogPosterDark),
      defaultAvatar: statusOf(b.defaultAvatar),
      robotsTxt: typeof b.robotsTxt === 'string' ? b.robotsTxt : '',
    },
  }
}

/**
 * Project the raw `SearchSettings` (from the settings bundle) into the
 * shape `<SearchForm>` expects, with API key masking.
 */
export function projectSearchForAdmin(
  search:
    | {
        search: {
          enabled?: boolean
          mode?: 'vector' | 'like'
          endpoint?: string
          apiKey?: string
          model?: string
          similarityThreshold?: number
        }
      }
    | undefined,
): SearchLoaderShape {
  const s = search ?? {
    search: {
      enabled: false,
      mode: 'like' as const,
      endpoint: '',
      apiKey: '',
      model: 'text-embedding-3-small',
      similarityThreshold: 0.5,
    },
  }
  const apiKey = typeof s.search.apiKey === 'string' ? s.search.apiKey : ''
  return {
    search: {
      enabled: s.search.enabled === true,
      mode: s.search.mode === 'vector' ? 'vector' : 'like',
      endpoint: s.search.endpoint ?? '',
      apiKey: '',
      model: s.search.model ?? 'text-embedding-3-small',
      similarityThreshold: s.search.similarityThreshold ?? 0.5,
    },
    apiKeyMask: apiKey === '' ? null : apiKey.slice(-4),
  }
}
