import type { SocialNetwork } from '@/shared/config/socials'

// Per-section DTOs for the editable blog configuration.
//
// The runtime config used to live in a single fat aggregated shape;
// it has since been split so that each settings page (general /
// localization / navigation / …) owns an isolated DTO. The DB layer
// stores one row per section (`scope='blog.<section>'`) and
// `BlogSettingsBundle` is the in-memory composition of those rows.
//
// Pre-install deployments observe `null` everywhere; the install gate
// catches those requests before any consumer reaches for a section.

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
    /** Page size for the inline comment thread (used on both client and server). */
    size: number
    avatar: {
      mirror: string
      size: number
    }
    /** TTL for the temporary comment edit token issued to anonymous commenters (seconds). */
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

// Metadata kept in the settings row for each S3-backed branding asset.
// Every branding slot — text and binary alike — stores its content in
// S3 under `branding/<kebab-slot>` and records this ref in the assets
// settings row. `etag` is the sha256 of the uploaded bytes; we use it
// both as the HTTP ETag value and as the in-process cache key for the
// buffer.
export interface BrandingObjectRef {
  etag: string
  contentType: string
  size: number
  updatedAt: string
}

export interface SiteAssetBranding {
  // User-uploaded asset slots (SVG + binary). Bytes live in S3 under
  // `branding/<kebab-slot>`; admins upload / clear through the
  // `/api/admin/branding/upload` and `/clear` endpoints.
  faviconSvg?: BrandingObjectRef
  logoSvg?: BrandingObjectRef
  logoDarkSvg?: BrandingObjectRef
  logoLargeSvg?: BrandingObjectRef
  logoLargeDarkSvg?: BrandingObjectRef
  // `faviconIco` / `appleTouchIcon` / `icon192` / `icon512` are auto-
  // derived from `faviconSvg` at upload time; the other four binaries
  // are independent admin uploads.
  faviconIco?: BrandingObjectRef
  appleTouchIcon?: BrandingObjectRef
  icon192?: BrandingObjectRef
  icon512?: BrandingObjectRef
  openGraph?: BrandingObjectRef
  blogPoster?: BrandingObjectRef
  blogPosterDark?: BrandingObjectRef
  defaultAvatar?: BrandingObjectRef

  // Configuration text, not a user asset — stays inline in the
  // settings row so the admin form can edit it in a textarea.
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
  og: { path: string; family: string }
  calendar: { path: string; family: string }
  globalCss: string[]
  postCss: string[]
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

export interface CorsSettings {
  cors: {
    enabled: boolean
    origins: string[]
  }
}

export interface SecuritySettings {
  csrf: {
    enabled: boolean
    exemptPaths: string[]
  }
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
  cache: CacheSettings | null
  rateLimit: RateLimitSettings | null
  search: SearchSettings | null
  fonts: FontsSettings | null
  cors: CorsSettings | null
  backup: BackupSettings | null
  limits: LimitsSettings | null
  analytics: AnalyticsSettings | null
  security: SecuritySettings | null
}
