import type { BundleKey, SECTION_TO_BUNDLE_KEY, SettingsSection } from '@/shared/config/sections'
import type { SocialNetwork } from '@/shared/config/socials'
import type { Assert, Equals } from '@/shared/contracts/primitives'
import type { CacheBucketSlot, TunableCacheBucketId } from '@/shared/types/cache'
import type { AvatarSource } from '@/shared/utils/avatar'

// The DB stores one row per section; `BlogSettingsBundle` is the in-memory
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
  /** Filled by the schema's `.default({ sectionTitle: '尾声礼记' })` on every read, so always present post-hydration. */
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

/** Calendar daily-quote sources: remote providers fall back to the built-in bank on failure; `custom` uses admin uploads (≥10, schema-enforced) and behaves like `local` below that. */
export type DailyQuoteSource = 'shanbay' | 'one' | 'hitokoto' | 'custom' | 'local'

export interface CustomQuote {
  content: string
  author: string
}

export interface SidebarSettings {
  sidebar: {
    widgets: SidebarWidget[]
    /** Filled by the schema's `.default(...)` on every read, so always present post-hydration. */
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
      /** Upstream fetch order; the site default avatar is the implicit final fallback. */
      sources: AvatarSource[]
    }
    /** GitHub PAT for the Search API email lookup; encrypted at rest, skipped when unset. */
    githubToken?: string
    /** TTL for the temporary comment edit token (seconds). */
    tokenTtlSeconds: number
  }
}

export interface WebmentionsSettings {
  webmention: {
    /** Off → POST /webmention answers 410 and the endpoint declaration is removed; existing rows stay moderation-able. */
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

// Slot list derives from the cache declaration registry, never hand-maintained.
export interface CacheSettings {
  cache: Record<TunableCacheBucketId, CacheBucketSlot>
}

// Backend a stored object lives in, recorded per asset so reads/deletes
// and the local→S3 migration target the right place; shared so the
// settings JSON shape and the server storage layer agree.
export type StorageDriver = 's3' | 'local'

// Per-asset metadata kept in the settings row. `etag` = sha256 of the
// uploaded bytes, used as the HTTP ETag and the in-process cache key.
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
  commentsGithubTokenMask: string | null
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

/**
 * Bundle shape downstream settings routes consume (and the
 * `admin.settings.bootstrap` output). Every section is NonNullable
 * because the settings layout loader enforces the invariant once.
 */
export type SettingsBundle = {
  [K in keyof BlogSettingsBundle]-?: NonNullable<BlogSettingsBundle[K]>
}

type DeepPartial<T> = T extends readonly (infer Item)[]
  ? DeepPartial<Item>[]
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T

/** Settings-card write payload: the section literal selects the matching persisted DTO; every property optional because cards submit honest section patches. The server deep-merges (objects merge, arrays replace) then validates. */
export type SettingsSectionPatch<Section extends SettingsSection> = DeepPartial<
  NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[Section]]>
>

// Compile-time parity: `BlogSettingsBundle` keys must mirror the
// section → bundle-key mapping in `sections.ts`.
type _blogSettingsBundleKeyParity = Assert<Equals<keyof BlogSettingsBundle, BundleKey>>
