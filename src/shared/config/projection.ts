import { z } from 'zod'

import type { MailSettings } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

// Per-slot status surfaced to the admin form. `etag` drives cache-busting
// in preview URLs and the "is configured?" check; we send the hash, NOT
// the bytes, so the loader response stays tiny.
export interface BrandingSlotStatus {
  /** Empty string when the slot has no custom upload. */
  etag: string
}

// Zod twins of the three masked loader shapes. They are the runtime gate
// of the settings save response (see `projectSectionForAdmin`): the save
// round-trip must produce exactly the shape the loader serves, or the
// assembly is drifting.

const brandingSlotStatusSchema = z.object({ etag: z.string() })

export const assetsLoaderShapeSchema = z.object({
  asset: z.object({ host: z.string(), scheme: z.enum(['http', 'https']) }),
  storage: z.object({
    enabled: z.boolean(),
    endpoint: z.string(),
    region: z.string(),
    bucket: z.string(),
    accessKeyId: z.string(),
    forcePathStyle: z.boolean(),
    urlTemplate: z.string(),
  }),
  secretAccessKeyMask: z.string().nullable(),
  upload: z.object({ maxBytes: z.number(), jpegQuality: z.number() }),
  branding: z.object({
    faviconSvg: brandingSlotStatusSchema,
    faviconIco: brandingSlotStatusSchema,
    appleTouchIcon: brandingSlotStatusSchema,
    icon192: brandingSlotStatusSchema,
    icon512: brandingSlotStatusSchema,
    logoSvg: brandingSlotStatusSchema,
    logoDarkSvg: brandingSlotStatusSchema,
    logoLargeSvg: brandingSlotStatusSchema,
    logoLargeDarkSvg: brandingSlotStatusSchema,
    openGraph: brandingSlotStatusSchema,
    blogPoster: brandingSlotStatusSchema,
    blogPosterDark: brandingSlotStatusSchema,
    defaultAvatar: brandingSlotStatusSchema,
    robotsTxt: z.string(),
  }),
})

export const mailLoaderShapeSchema = z.object({
  mail: z.object({
    enabled: z.boolean(),
    host: z.string(),
    sender: z.string(),
    apiKeyMask: z.string().nullable(),
    transport: z.enum(['zeabur', 'smtp', 'mailgun']),
    smtpHost: z.string(),
    smtpPort: z.number(),
    smtpUser: z.string(),
    smtpPassMask: z.string().nullable(),
    smtpSecure: z.boolean(),
    smtpRequireTls: z.boolean(),
    smtpRejectUnauthorized: z.boolean(),
    mailgunDomain: z.string(),
    mailgunApiKeyMask: z.string().nullable(),
  }),
})

export const searchLoaderShapeSchema = z.object({
  search: z.object({
    enabled: z.boolean(),
    mode: z.enum(['vector', 'like', 'trgm']),
    endpoint: z.string(),
    apiKey: z.string(),
    model: z.string(),
    similarityThreshold: z.number(),
    trgmThreshold: z.number(),
  }),
  apiKeyMask: z.string().nullable(),
})

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
    mode: 'vector' | 'like' | 'trgm'
    endpoint: string
    apiKey: string
    model: string
    similarityThreshold: number
    trgmThreshold: number
  }
  apiKeyMask: string | null
}

// Mirrors `MailSettings` but with the three secrets swapped for their
// masks so the form never receives ciphertext. The outer `mail:` wrapper
// matches `mailSchema` so the patches produced by `useSettingsCard`
// validate on the server without translation.
export interface MailLoaderShape {
  mail: {
    enabled: boolean
    host: string
    sender: string
    apiKeyMask: string | null
    transport: 'zeabur' | 'smtp' | 'mailgun'
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPassMask: string | null
    smtpSecure: boolean
    smtpRequireTls: boolean
    smtpRejectUnauthorized: boolean
    mailgunDomain: string
    mailgunApiKeyMask: string | null
  }
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

export function projectAssetsForAdmin(
  assets: {
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
  },
  secretAccessKeyMask?: string | null,
): AssetsLoaderShape {
  const secretAccessKey = typeof assets.storage.secretAccessKey === 'string' ? assets.storage.secretAccessKey : ''
  const b = assets.branding ?? {}
  return {
    asset: { host: assets.asset.host, scheme: assets.asset.scheme },
    storage: {
      enabled: assets.storage.enabled === true,
      endpoint: assets.storage.endpoint ?? '',
      region: assets.storage.region ?? '',
      bucket: assets.storage.bucket ?? '',
      accessKeyId: assets.storage.accessKeyId ?? '',
      forcePathStyle: assets.storage.forcePathStyle === true,
      urlTemplate: assets.storage.urlTemplate ?? '',
    },
    secretAccessKeyMask: secretAccessKeyMask ?? (secretAccessKey === '' ? null : secretAccessKey.slice(-4)),
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
          mode?: 'vector' | 'like' | 'trgm'
          endpoint?: string
          apiKey?: string
          model?: string
          similarityThreshold?: number
          trgmThreshold?: number
        }
      }
    | undefined,
  apiKeyMask?: string | null,
): SearchLoaderShape {
  const s = search ?? {
    search: {
      enabled: false,
      mode: 'trgm' as const,
      endpoint: '',
      apiKey: '',
      model: 'text-embedding-3-small',
      similarityThreshold: 0.5,
      trgmThreshold: 0.3,
    },
  }
  const apiKey = typeof s.search.apiKey === 'string' ? s.search.apiKey : ''
  return {
    search: {
      enabled: s.search.enabled === true,
      mode: s.search.mode === 'vector' || s.search.mode === 'trgm' ? s.search.mode : 'like',
      endpoint: s.search.endpoint ?? '',
      apiKey: '',
      model: s.search.model ?? 'text-embedding-3-small',
      similarityThreshold: s.search.similarityThreshold ?? 0.5,
      trgmThreshold: s.search.trgmThreshold ?? 0.3,
    },
    apiKeyMask: apiKeyMask ?? (apiKey === '' ? null : apiKey.slice(-4)),
  }
}

/**
 * Project the raw `MailSettings` into the shape `<MailForm>` expects:
 * the three encrypted secrets are swapped for their masks, and both SMTP
 * TLS flags are forwarded. The input is the post-hydration bundle slice,
 * so schema defaults guarantee every non-secret field is present.
 */
export function projectMailForAdmin(
  mail: MailSettings,
  masks?: {
    apiKeyMask?: string | null
    smtpPassMask?: string | null
    mailgunApiKeyMask?: string | null
  },
): MailLoaderShape {
  const m = mail.mail
  return {
    mail: {
      enabled: m.enabled,
      host: m.host,
      sender: m.sender,
      apiKeyMask: masks?.apiKeyMask ?? (m.apiKey ? m.apiKey.slice(-4) : null),
      transport: m.transport,
      smtpHost: m.smtpHost,
      smtpPort: m.smtpPort,
      smtpUser: m.smtpUser,
      smtpPassMask: masks?.smtpPassMask ?? (m.smtpPass ? m.smtpPass.slice(-4) : null),
      smtpSecure: m.smtpSecure,
      smtpRequireTls: m.smtpRequireTls,
      smtpRejectUnauthorized: m.smtpRejectUnauthorized,
      mailgunDomain: m.mailgunDomain,
      mailgunApiKeyMask: masks?.mailgunApiKeyMask ?? (m.mailgunApiKey ? m.mailgunApiKey.slice(-4) : null),
    },
  }
}

// Compile-time parity: the Zod twins above must stay isomorphic to the
// hand-written interfaces the forms consume, or the runtime gate would be
// validating a different shape than the one the UI expects.
type _assetsShapeParity = Assert<Equals<z.infer<typeof assetsLoaderShapeSchema>, AssetsLoaderShape>>
type _mailShapeParity = Assert<Equals<z.infer<typeof mailLoaderShapeSchema>, MailLoaderShape>>
type _searchShapeParity = Assert<Equals<z.infer<typeof searchLoaderShapeSchema>, SearchLoaderShape>>
