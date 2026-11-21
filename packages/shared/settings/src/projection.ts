import type { BackupSettings, CommentsSettings, MailSettings } from '@kobato/settings/types'

import { AVATAR_SOURCES } from '@kobato/assets/avatar'
import { z } from 'zod'

export type BrandingSlotStatus = z.infer<typeof brandingSlotStatusSchema>

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
    defaultMusicCover: brandingSlotStatusSchema,
    robotsTxt: z.string(),
  }),
})

export const mailLoaderShapeSchema = z.object({
  mail: z.object({
    enabled: z.boolean(),
    notificationEmails: z.boolean(),
    sender: z.string(),
    transport: z.enum(['smtp', 'mailgun']),
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

export const commentsLoaderShapeSchema = z.object({
  comments: z.object({
    size: z.number(),
    avatar: z.object({
      mirror: z.string(),
      sources: z.array(z.enum(AVATAR_SOURCES)),
    }),
    githubTokenMask: z.string().nullable(),
    tokenTtlSeconds: z.number(),
  }),
})

export const backupLoaderShapeSchema = z.object({
  scheduled: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    hour: z.number(),
    minute: z.union([z.literal(0), z.literal(30)]),
    dayOfWeek: z.number().optional(),
    dayOfMonth: z.number().optional(),
  }),
  retention: z.object({ enabled: z.boolean(), days: z.number() }),
  encryption: z.object({ enabled: z.boolean(), password: z.string().optional() }),
  passwordMask: z.string().nullable(),
})

export type AssetsLoaderShape = z.infer<typeof assetsLoaderShapeSchema>

export type MailLoaderShape = z.infer<typeof mailLoaderShapeSchema>

export type CommentsLoaderShape = z.infer<typeof commentsLoaderShapeSchema>

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
      defaultMusicCover?: RawBrandingRef
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
      defaultMusicCover: statusOf(b.defaultMusicCover),
      robotsTxt: typeof b.robotsTxt === 'string' ? b.robotsTxt : '',
    },
  }
}

export function projectMailForAdmin(
  mail: MailSettings,
  masks?: {
    smtpPassMask?: string | null
    mailgunApiKeyMask?: string | null
  },
): MailLoaderShape {
  const m = mail.mail
  return {
    mail: {
      enabled: m.enabled,
      notificationEmails: m.notificationEmails,
      sender: m.sender,
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

export function projectCommentsForAdmin(
  comments: CommentsSettings,
  githubTokenMask?: string | null,
): CommentsLoaderShape {
  const c = comments.comments
  return {
    comments: {
      size: c.size,
      avatar: {
        mirror: c.avatar.mirror,
        sources: c.avatar.sources,
      },
      githubTokenMask: githubTokenMask ?? (c.githubToken ? c.githubToken.slice(-4) : null),
      tokenTtlSeconds: c.tokenTtlSeconds,
    },
  }
}

export type BackupLoaderShape = z.infer<typeof backupLoaderShapeSchema>

export function projectBackupForAdmin(backup: BackupSettings, passwordMask?: string | null): BackupLoaderShape {
  const password = typeof backup.encryption.password === 'string' ? backup.encryption.password : ''
  return {
    ...backup,
    passwordMask: passwordMask ?? (password === '' ? null : password.slice(-4)),
  }
}
