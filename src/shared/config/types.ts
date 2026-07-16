import type { BundleKey } from '@/shared/config/sections'
import type { SocialNetwork } from '@/shared/config/socials'
import type { Assert, Equals } from '@/shared/contracts/primitives'

// Per-section DTOs for the editable blog configuration.
//
// The runtime config used to live in a single fat aggregated shape;
// it has since been split so that each settings page owns an isolated
// DTO. The DB stores one row per section and `BlogSettingsBundle` is
// the in-memory composition of those rows.

export interface SiteIdentitySettings {
  title: string
  description: string
  website: string
  keywords: string[]
  author: { name: string; email: string; url: string }
  locale: string
  timeZone: string
  timeFormat: string
  initialYear: number
  icpNo?: string
  moeIcpNo?: string
}

export interface NavigationItem {
  text: string
  link: string
  target?: string
}

export interface NavigationSettings {
  navigation: {
    sideNav: NavigationItem[]
    footerNav: FooterNavItem[]
  }
}

export interface SocialItem {
  name: string
  network: SocialNetwork
  type: 'link' | 'qrcode'
  title?: string
  link: string
}

export interface SocialsSettings {
  socials: SocialItem[]
}

export interface ContentSettings {
  pagination: {
    posts: number
    category: number
    tags: number
    search: number
  }
  feed: {
    full: boolean
    size: number
  }
  post: {
    sort: 'asc' | 'desc'
    sortBy: 'publishedAt' | 'updatedAt'
    featureEnabled: boolean
  }
  /**
   * Legacy rows may omit this bucket until the admin saves 「内容与分页」.
   * Runtime renders fall back to 「尾声礼记」 via `@/shared/utils/footnotes-section-title`.
   */
  footnotes?: {
    sectionTitle: string
  }
}

export type SidebarWidgetType = 'search' | 'recentPosts' | 'recentComments' | 'randomTags' | 'todayCalendar'

export interface SidebarWidget {
  type: SidebarWidgetType
  enabled: boolean
  count?: number
}

export interface SidebarSettings {
  sidebar: {
    widgets: SidebarWidget[]
  }
}

export interface CommentsSettings {
  comments: {
    /** Page size for the inline comment thread. */
    size: number
    avatar: {
      mirror: string
      size: number
    }
    /** TTL for the temporary comment edit token (seconds). */
    tokenTtlSeconds: number
  }
}

export interface SeoSettings {
  toc: {
    minHeadingLevel: number
    maxHeadingLevel: number
  }
  og: {
    width: number
    height: number
  }
}

export type FooterNavItemType = 'social' | 'themeToggle' | 'search'

export interface FooterNavItem {
  type: FooterNavItemType
  network?: SocialNetwork // only when type === 'social'
}

export interface MailSettings {
  mail: {
    enabled: boolean
    host: string
    apiKey: string
    sender: string
    /** Vendor selector — `'zeabur'`, `'smtp'`, or `'mailgun'`. */
    transport: 'zeabur' | 'smtp' | 'mailgun'
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPass: string
    smtpSecure: boolean
    smtpRequireTls?: boolean
    smtpRejectUnauthorized?: boolean
    mailgunDomain: string
    mailgunApiKey: string
  }
}

export interface NewsletterSettings {
  newsletter: {
    /** Master switch for the public subscribe endpoint. Default off. */
    enabled: boolean
    /** Display name used as the sender identity in newsletter emails. */
    fromName: string
    /** Prefix prepended to newsletter email subjects (e.g. the site name). */
    subjectPrefix: string
  }
}

export interface CacheSettings {
  cache: {
    og: { prefix: string; ttlSeconds: number }
    calendar: { prefix: string; ttlSeconds: number }
    avatar: { prefix: string; ttlSeconds: number }
    imageMeta: { prefix: string; ttlSeconds: number }
    embeddingSearch: { prefix: string; ttlSeconds: number }
    searchResult: { prefix: string; ttlSeconds: number }
  }
}

// The backend a stored object lives in. Each asset (image, music,
// branding slot, backup) records its driver so reads, deletes, and the
// local→S3 migration target the right place. Defined here (shared) so
// the settings JSON shape and the server storage layer agree on it.
export type StorageDriver = 's3' | 'local'

// Metadata kept in the settings row for each branding asset.
// `etag` is the sha256 of the uploaded bytes; used as the HTTP ETag
// value and as the in-process cache key. `driver` records which backend
// the bytes live in ('s3' | 'local'); it defaults to 's3' for refs
// created before local storage existed.
export interface BrandingObjectRef {
  etag: string
  contentType: string
  size: number
  updatedAt: string
  driver: StorageDriver
}

export interface SiteAssetBranding {
  faviconSvg?: BrandingObjectRef
  logoSvg?: BrandingObjectRef
  logoDarkSvg?: BrandingObjectRef
  logoLargeSvg?: BrandingObjectRef
  logoLargeDarkSvg?: BrandingObjectRef
  faviconIco?: BrandingObjectRef
  appleTouchIcon?: BrandingObjectRef
  icon192?: BrandingObjectRef
  icon512?: BrandingObjectRef
  openGraph?: BrandingObjectRef
  blogPoster?: BrandingObjectRef
  blogPosterDark?: BrandingObjectRef
  defaultAvatar?: BrandingObjectRef
  robotsTxt?: string
}

export interface AssetsSettings {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled: boolean
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
    urlTemplate: string
  }
  upload: {
    maxBytes: number
    jpegQuality: number
  }
  branding?: SiteAssetBranding
}

export interface RateLimitBucket {
  windowSeconds: number
  maxAttempts: number
}

export interface RateLimitSettings {
  signInIp: RateLimitBucket
  commentPostIp: RateLimitBucket
  commentPostEmail: RateLimitBucket
  likeIncreaseIp: RateLimitBucket
  inviteIp: RateLimitBucket
  inviteEmail: RateLimitBucket
  passwordResetIp: RateLimitBucket
  passwordResetEmail: RateLimitBucket
  passwordResetTarget: RateLimitBucket
  resourceIp: RateLimitBucket
  otpSendIp: RateLimitBucket
  otpSendEmail: RateLimitBucket
  otpVerifyIp: RateLimitBucket
  otpVerifyEmail: RateLimitBucket
  signInEmail: RateLimitBucket
  passkeyAuthBeginIp: RateLimitBucket
  passkeyAuthFinishIp: RateLimitBucket
  passkeyRegisterBeginIp: RateLimitBucket
  passkeyRegisterFinishIp: RateLimitBucket
  passkeySetForceIp: RateLimitBucket
  passkeyDeleteIp: RateLimitBucket
}

export interface SearchSettings {
  search: {
    enabled: boolean
    mode: 'vector' | 'like'
    endpoint: string
    apiKey: string
    model: string
    similarityThreshold: number
  }
}

export interface FontsSettings {
  og: { family: string }
  calendar: { family: string }
  /** Ordered `font.id` UUIDs assigned to the site-wide UI slot. */
  global: string[]
  /** Ordered `font.id` UUIDs assigned to the article-body slot. */
  post: string[]
  /** Ordered `font.id` UUIDs assigned to the inline/block code slot. */
  code: string[]
}

export interface BackupSettings {
  scheduled: {
    enabled: boolean
    frequency: 'daily' | 'weekly' | 'monthly'
    hour: number
    minute: 0 | 30
    dayOfWeek?: number
    dayOfMonth?: number
  }
  retention: {
    enabled: boolean
    days: number
  }
}

export interface LimitsSettings {
  maxRequestBodySize: number
  sessionMaxAge: number
  auditLogDbRetentionDays: number
  auditLogArchiveRetentionDays: number
}

export interface AnalyticsSettings {
  analytics: {
    trackAdmin: boolean
    keepBotRows: boolean
  }
}

export interface SecuritySettings {
  csrf: {
    enabled: boolean
    exemptPaths: string[]
  }
  cors: {
    enabled: boolean
    origins: string[]
  }
  otp: {
    enabled: boolean
  }
  passkey: {
    enabled: boolean
  }
}

export interface SecretMasks {
  mailApiKeyMask: string | null
  mailSmtpPassMask: string | null
  mailMailgunApiKeyMask: string | null
  assetsSecretAccessKeyMask: string | null
  searchApiKeyMask: string | null
}

export interface BlogSettingsBundle {
  siteIdentity: SiteIdentitySettings | null
  assets: AssetsSettings | null
  navigation: NavigationSettings | null
  socials: SocialsSettings | null
  content: ContentSettings | null
  sidebar: SidebarSettings | null
  comments: CommentsSettings | null
  seo: SeoSettings | null
  mail: MailSettings | null
  newsletter: NewsletterSettings | null
  cache: CacheSettings | null
  rateLimit: RateLimitSettings | null
  search: SearchSettings | null
  fonts: FontsSettings | null
  backup: BackupSettings | null
  limits: LimitsSettings | null
  analytics: AnalyticsSettings | null
  security: SecuritySettings | null
}

// Compile-time parity: BlogSettingsBundle keys must mirror the section →
// bundle-key mapping in `sections.ts`. Adding a section without a bundle
// slot (or renaming one side) fails type-checking here.
type _blogSettingsBundleKeyParity = Assert<Equals<keyof BlogSettingsBundle, BundleKey>>
