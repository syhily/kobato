import type { BundleKey, SECTION_TO_BUNDLE_KEY, SettingsSection } from '@/shared/config/sections'
import type { SocialNetwork } from '@/shared/config/socials'
import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { CacheBucketSlot, TunableCacheBucketId } from '@/shared/types/cache'

// Per-section DTOs for the editable blog configuration. The DB stores
// one row per section and `BlogSettingsBundle` is the in-memory
// composition of those rows.

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
   * The schema's `.default({ sectionTitle: '尾声礼记' })`
   * (`schemas/content.ts`) fills this bucket on every read, so it is
   * always present post-hydration.
   */
  footnotes: {
    sectionTitle: string
  }
}

export type SidebarWidgetType = 'search' | 'recentPosts' | 'recentComments' | 'randomTags' | 'todayCalendar'

export interface SidebarWidget {
  type: SidebarWidgetType
  enabled: boolean
  count?: number
}

/** Daily-quote sources for the calendar image. The three remote providers
 * fall back to the built-in bank on failure; `custom` uses the
 * admin-uploaded `customQuotes` (≥ 10 entries, enforced by the schema) and
 * behaves like `local` below that; `local` is the built-in bank only. */
export type DailyQuoteSource = 'shanbay' | 'one' | 'hitokoto' | 'custom' | 'local'

export interface CustomQuote {
  content: string
  author: string
}

export interface SidebarSettings {
  sidebar: {
    widgets: SidebarWidget[]
    /**
     * The schema's `.default(...)` (`schemas/sidebar.ts`) fills this bucket
     * on every read, so it is always present post-hydration.
     */
    dailyQuote: {
      source: DailyQuoteSource
      customQuotes: CustomQuote[]
    }
  }
}

export interface CommentsSettings {
  comments: {
    /** Page size for the inline comment thread. */
    size: number
    avatar: {
      mirror: string
    }
    /** TTL for the temporary comment edit token (seconds). */
    tokenTtlSeconds: number
  }
}

export interface WebmentionsSettings {
  webmention: {
    /** Receive endpoint gate: off → POST /webmention answers 410 and the
     *  endpoint declaration (`<link rel="webmention">` + HTTP Link header)
     *  is removed. Existing rows stay moderation-able. */
    receiveEnabled: boolean
    /** Public gate: off → approved mentions are not rendered under posts/pages. */
    displayOnPosts: boolean
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
    apiKey?: string | undefined
    sender: string
    /** Vendor selector — `'zeabur'`, `'smtp'`, or `'mailgun'`. */
    transport: 'zeabur' | 'smtp' | 'mailgun'
    smtpHost: string
    smtpPort: number
    smtpUser: string
    smtpPass?: string | undefined
    smtpSecure: boolean
    smtpRequireTls: boolean
    smtpRejectUnauthorized: boolean
    mailgunDomain: string
    mailgunApiKey?: string | undefined
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

// Only tunable buckets own a settings slot — the slot list derives from
// the cache declaration registry, never from a hand-maintained list.
export interface CacheSettings {
  cache: Record<TunableCacheBucketId, CacheBucketSlot>
}

// The backend a stored object lives in. Each asset (image, music,
// branding slot, backup) records its driver so reads, deletes, and the
// local→S3 migration target the right place. Defined here (shared) so
// the settings JSON shape and the server storage layer agree on it.
export type StorageDriver = 's3' | 'local'

// Metadata kept in the settings row for each branding asset. `etag` is
// the sha256 of the uploaded bytes, used as the HTTP ETag value and as
// the in-process cache key.
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
  defaultMusicCover?: BrandingObjectRef
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
    secretAccessKey?: string | undefined
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
    geoipAutoUpdate: boolean
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
  passkey: {
    enabled: boolean
  }
}

export interface SecretMasks {
  mailApiKeyMask: string | null
  mailSmtpPassMask: string | null
  mailMailgunApiKeyMask: string | null
  assetsSecretAccessKeyMask: string | null
}

export interface BlogSettingsBundle {
  siteIdentity: SiteIdentitySettings | null
  assets: AssetsSettings | null
  navigation: NavigationSettings | null
  socials: SocialsSettings | null
  content: ContentSettings | null
  sidebar: SidebarSettings | null
  comments: CommentsSettings | null
  webmentions: WebmentionsSettings | null
  seo: SeoSettings | null
  mail: MailSettings | null
  newsletter: NewsletterSettings | null
  cache: CacheSettings | null
  rateLimit: RateLimitSettings | null
  fonts: FontsSettings | null
  backup: BackupSettings | null
  limits: LimitsSettings | null
  analytics: AnalyticsSettings | null
  security: SecuritySettings | null
}

type DeepPartial<T> = T extends readonly (infer Item)[]
  ? DeepPartial<Item>[]
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T

/**
 * Compile-time contract for a settings card's write payload. The section
 * literal selects the matching persisted DTO, while every nested property
 * is optional because cards submit honest Section patches — only the
 * fields the card owns. The server deep-merges the patch into the stored
 * row (objects merge, arrays replace) and validates the merged section.
 */
export type SettingsSectionPatch<Section extends SettingsSection> = DeepPartial<
  NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[Section]]>
>

// Compile-time parity: BlogSettingsBundle keys must mirror the section →
// bundle-key mapping in `sections.ts`. Adding a section without a bundle
// slot (or renaming one side) fails type-checking here.
type _blogSettingsBundleKeyParity = Assert<Equals<keyof BlogSettingsBundle, BundleKey>>
