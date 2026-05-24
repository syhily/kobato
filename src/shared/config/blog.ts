import type { SocialNetwork } from '@/shared/config/socials'

// Per-section DTOs for the editable blog configuration.
//
// The runtime config used to live in a single fat aggregated shape;
// it has since been split so that each settings page (general /
// localization / navigation / …) owns an isolated DTO. The DB layer
// stores one row per section (`scope='blog.<section>'`) and
// `BlogSettingsBundle` is the in-memory composition of those rows.
//
// This file is **types-only** by design — the file has no runtime
// surface and zero side effects. The matching runtime module
// (`@/shared/config/blog`) re-exports every type below alongside the
// snapshot slot machinery, so existing import sites keep working
// unchanged. Pure types-only modules can be erased by the bundler
// (per the `bundle-analyzable-paths` rule), which is why the
// per-section React contexts file under `src/ui/lib/` imports
// straight from this file: it doesn't need the snapshot slot at all
// and the smaller import graph keeps the contexts file out of any
// bundle pulled in by the (server-only) snapshot consumers.
//
// Pre-install deployments observe `null` everywhere; the install gate
// catches those requests before any consumer reaches for a section.

// Site identity now also owns the date-formatter inputs (`locale`,
// `timeZone`, `timeFormat`). Folding them into a single section keeps
// `/admin/settings/general` as the one place an operator changes
// "what does the site call itself, in what language" without bouncing
// between two pages.
//
// `locale` is a BCP 47 tag (e.g. `zh-CN`); `timeZone` is an IANA name
// (e.g. `Asia/Shanghai`); `timeFormat` is the project's small token
// language consumed by `formatLocalDate` (`yyyy LL MM dd HH mm`).
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

export function getSidebarWidgetCount(
  settings: SidebarSettings,
  type: 'recentPosts' | 'recentComments' | 'randomTags',
): number {
  const widget = settings.sidebar.widgets.find((w) => w.type === type)
  if (!widget || !widget.enabled) {
    return 0
  }
  return widget.count ?? 0
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

export function extractXHandle(socials: Array<{ network: SocialNetwork; link: string }>): string | undefined {
  const x = socials.find((s) => s.network === 'x')
  if (!x || !x.link) {
    return undefined
  }
  try {
    const url = new URL(x.link)
    const handle = url.pathname.replace(/^\//, '')
    if (!handle) {
      return undefined
    }
    return handle.startsWith('@') ? handle : `@${handle}`
  } catch {
    return undefined
  }
}

export type FooterNavItemType = 'social' | 'themeToggle' | 'search'

export interface FooterNavItem {
  type: FooterNavItemType
  network?: SocialNetwork // only when type === 'social'
}

// Outbound mail (Zeabur ZSend) configuration. The `apiKey` field is
// stored as plaintext — see the admin Mail page for the operational
// caveats around DB backups.
export interface MailSettings {
  mail: {
    enabled: boolean
    host: string
    apiKey: string
    sender: string
  }
}

// Per-bucket Redis cache configuration. Bucket ids are hard-coded
// in the writers — `og` / `calendar` / `avatar` for binary
// generated-image surfaces, plus `image-meta`
// (the two former `lru-cache` instances now routed through Redis so
// every replica shares warmth). The key PREFIX and TTL are
// runtime-editable so an admin can rename a colliding prefix or
// shorten / lengthen a TTL without redeploying.
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

// Merged "存储配置" section: the music CDN host (consumed by
// `<MusicPlayer>` to fetch APlayer audio + lyric metadata from
// `${asset.scheme}://${asset.host}/music/<id>.json`) AND the
// S3-compatible storage credentials AND the upload limits for the
// admin "图片管理" surface. Image public URLs share the same
// `${asset.scheme}://${asset.host}` base with music metadata, so
// keeping both in one section means there's only one place to update
// when the CDN moves.
//
// `storage.enabled` is the master switch:
//   - `false` (default for fresh installs) — uploads are refused at
//     the perimeter; the admin can still browse historical rows and
//     the public render pipeline still resolves their stored URL via
//     `asset.host`. Other S3 fields may be empty strings while the
//     toggle is off so flipping it back on doesn't force the operator
//     to re-enter every field.
//   - `true` — every field below is required (the schema enforces it
//     in `superRefine`). The runtime upload service writes to the
//     configured bucket.
//
// `secretAccessKey` is stored as plaintext just like `mail.apiKey`;
// see the matching admin caveat in the form copy. The form treats an
// empty submitted secret as "keep the existing value" so the admin
// can edit other fields without re-pasting the secret on every save.
export interface AssetsSettings {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    /** Master switch: when `false`, the upload service refuses every request. */
    enabled: boolean
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    forcePathStyle: boolean
    /**
     * Optional transform template for remote image URLs served by the
     * `asset.host` CDN. Used by the `<Image />` primitive:
     *
     *   - Empty string => passthrough URL (no transform).
     *   - Supports placeholders `{src}`, `{width}`, `{height}`, `{quality}`.
     *   - If `{src}` is omitted, the rendered template is appended to `src`.
     */
    urlTemplate: string
  }
  upload: {
    /** Hard ceiling for an upload after the browser-side JPEG re-encode. */
    maxBytes: number
    /** Default sharp `mozjpeg` quality used by the upload pipeline. */
    jpegQuality: number
  }
}

// Centralised rate-limiting policy. Each bucket is a single
// `(windowSeconds, maxAttempts)` pair the runtime applies to its
// matching surface (login by IP, comment POST by IP / email, like
// increase by IP). Editing the bucket from `/admin/settings/rate-limit`
// takes effect on the next request — the rate-limit module reads the
// fresh slot every call so an admin loosening or tightening the cap
// never has to wait for a TTL or restart.
//
// `windowSeconds` is the rolling Redis EXPIRE TTL; `maxAttempts` is
// the strict upper bound on counter values within that window.
// `count > maxAttempts` returns `exceeded: true`. Setting
// `maxAttempts = 0` would block every attempt; the schema clamps it
// to >= 1 to keep that footgun off the admin form.
export interface RateLimitBucket {
  /** Rolling window for the counter (seconds). */
  windowSeconds: number
  /** Max attempts allowed within the window before the next is rejected. */
  maxAttempts: number
}

export interface RateLimitSettings {
  /** Login attempts per client IP. Counts both successful and failed sign-ins. */
  signInIp: RateLimitBucket
  /** Public comment submissions per client IP. */
  commentPostIp: RateLimitBucket
  /** Public comment submissions per normalised author email (hashed in Redis). */
  commentPostEmail: RateLimitBucket
  /**
   * Like (post / page upvote) increases per client IP. Counters are
   * scoped per IP only — token-based decreases never touch this
   * bucket so an admin can raise the cap without affecting cancel
   * flows.
   */
  likeIncreaseIp: RateLimitBucket
  /** Admin author invitations per client IP. */
  inviteIp: RateLimitBucket
  /**
   * Admin author invitations per `(actor admin id, invitee email)`
   * pair. Mailboxes are hashed in Redis (raw never lands there).
   * Stops a single admin from carpet-bombing one mailbox even if
   * their per-IP budget is fresh.
   */
  inviteEmail: RateLimitBucket
  /** Password-reset requests per client IP. */
  passwordResetIp: RateLimitBucket
  /**
   * Public lostpassword form per normalised target email (hashed in
   * Redis). Stops an attacker rotating IPs from spamming a single
   * mailbox with reset prompts.
   */
  passwordResetEmail: RateLimitBucket
  /**
   * Admin-triggered password reset emails per target user id. Stops a
   * (rogue / compromised) admin from spamming any single mailbox even
   * if their own IP rate-limit budget is fresh.
   */
  passwordResetTarget: RateLimitBucket
  /** Public resource endpoints (RSS, sitemap, OG images, avatars) per client IP. */
  resourceIp: RateLimitBucket
}

export interface SearchSettings {
  search: {
    /** Master switch: when false, search falls back to plain LIKE. */
    enabled: boolean
    /** 'vector' = OpenAI embedding + pgvector; 'like' = Postgres ILIKE on plainText. */
    mode: 'vector' | 'like'
    /** OpenAI-compatible API endpoint. Empty string means use the official OpenAI endpoint. */
    endpoint: string
    /** OpenAI API key. Stored as plaintext like mail.apiKey. */
    apiKey: string
    /** Embedding model. Defaults to text-embedding-3-small (cheap, CJK-friendly). */
    model: string
    /** Cosine similarity threshold (0–1). Only results ≥ this score are returned. */
    similarityThreshold: number
  }
}

// Font configuration — both server-side TTFs (for Canvas image
// rendering) and browser-side @font-face CSS bundles (for live page
// rendering). Every slot is a public URL; empty string is the
// "not configured" sentinel and each consumer degrades gracefully:
//
//   - Canvas slots (`og`, `calendar`): empty url skips
//     `GlobalFonts.register()` so Canvas falls back to system CJK
//     shaping. The OG / calendar image still renders, just with uglier
//     typography.
//   - CSS slots (`globalCss`, `postCss`): empty url skips emitting the
//     `<link rel="stylesheet">`. Browser falls back to the CSS-stack
//     fallback fonts declared in `tailwind.css` (`--font-sans`,
//     `--font-serif`, `--font-code`).
//
// `@napi-rs/canvas` only accepts FreeType inputs — **TTF/OTF, not
// WOFF/WOFF2** — so the admin help text must surface that constraint
// on the Canvas slots. The CSS slots, in contrast, should reference
// a `.css` file that itself loads woff2 chunks (the standard
// `cn-font-split` output reshipped to a CDN).
export interface FontsSettings {
  /** Relative path + font family for the OG-image renderer (post title + site name). */
  og: { path: string; family: string }
  /** Relative path + font family for the calendar image renderer (day digits). */
  calendar: { path: string; family: string }
  /**
   * CSS bundle URLs injected into every page's `<head>`. Each entry
   * becomes one `<link rel="stylesheet">`. Typical use: one URL per
   * font family — e.g. `[opposans.css, iosevka.css]` for the site-wide
   * body + monospace fonts. Each CSS file should declare its
   * `@font-face` rules pointing at woff2 chunks (we ship the
   * `cn-font-split` output to a CDN). Empty array = no global font
   * stylesheets injected (browser falls back to the CSS-stack defaults
   * declared in `tailwind.css`).
   */
  globalCss: string[]
  /**
   * CSS bundle URLs injected only on `/posts/:slug` and `/:slug` (page
   * detail) routes. Each entry becomes one `<link rel="stylesheet">`.
   * Reserved for heavy fonts that only the long-form prose surface
   * needs (e.g. OPPO Serif). Loaded lazily so the home / archives /
   * admin pages don't pay the bandwidth. Empty array = no extra
   * stylesheets on detail pages.
   */
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
  /** Maximum request body size in bytes (default: 10 MB). */
  maxRequestBodySize: number
  /** Session cookie max-age in seconds (default: 30 days). */
  sessionMaxAge: number
  /** Audit log retention days in DB (default: 30). */
  auditLogDbRetentionDays: number
  /** Audit log archive retention days in S3 (default: 180). */
  auditLogArchiveRetentionDays: number
}

export interface AnalyticsSettings {
  analytics: {
    /** When `true`, admin sessions' visits are written to `access_log`. */
    trackAdmin: boolean
    /** When `true`, bot rows are kept in `access_log` instead of stripped. */
    keepBotRows: boolean
  }
}

export interface CorsSettings {
  cors: {
    /** Master switch: when `false`, the middleware skips CORS entirely. */
    enabled: boolean
    /** Allowed origin URLs. Empty array = mirror mode (reflect request origin). */
    origins: string[]
  }
}

// Composed bundle of every section. Each field is `null` until the
// corresponding `setting('blog.<section>')` row has been seeded by the
// install flow or the admin panel. A "fully installed" deployment has
// at least `siteIdentity` and `assets` populated (the install flow
// admin visits the matching `/admin/settings/*` page.
//
// The field set is fixed (twelve buckets, one per `SettingsSection`).
// Adding a thirteenth section is a change to `SETTINGS_SECTIONS` and
// `SECTION_TO_BUNDLE_KEY` in `@/shared/config/settings.ts` plus extending
// the typed shape below — no sibling `emptyBundle()` / context list
// to also remember.
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
}

// Runtime half of the blog-config module. The pure-types half lives in
// `@/shared/config/blog` and is re-exported below so existing
//
// Splitting the file lets pure-UI consumers (notably the per-section
// React contexts file under `src/ui/lib/`) import only the types file
// and stay out of the snapshot-slot import graph — which matters
// because the slot reaches into `globalThis` and is a runtime side
// effect.
//
// Lives in `@/shared/` (not `@/server/`) on purpose: this module is
// reached transitively from route `meta()` exports (via
// `@/server/render/seo/meta`), and `meta()` runs on the client too — so
// anything imported from it ends up in the browser bundle. Keeping the
// reader here keeps the client bundle free of `pg` / `drizzle-orm` while
// still letting SSR hand the latest DB-backed values to the live route
// loaders.
//
// The writer half (DB query + hydration + refresh-on-write) lives in
// `@/server/domains/settings/snapshot` and stays server-only. Both modules talk
// through the same module-internal slot via the
// `BLOG_SETTINGS_SNAPSHOT_SLOT` symbol so a single in-process snapshot
// is observable everywhere.
//
// The slot is **not** synced from the client tree at render time. SSR
// hydrates it once at boot; client-side it stays `null` because the
// React contexts (`<BlogSettingsProvider>`) are the canonical source of
// settings on the browser side. Any helper that historically reached
// for the snapshot from a `meta()` callback now takes the bundle as an
// explicit argument extracted from `Route.MetaArgs.matches`.
//
// On a fresh deployment that hasn't been installed yet, the snapshot
// returns `null`: the install gate
// (`@/server/middleware/install-gate`) catches every non-install
// request before any consumer reaches for the snapshot, but defensive
// callers should still guard against the possibility — see the
// `require…` helpers below.

import { CACHE_BUCKET_FALLBACKS, type CacheBucketSlot } from '@/shared/types/cache'

const globalForSnapshot = globalThis as typeof globalThis & {
  blogSettingsSnapshot: BlogSettingsBundle | null | undefined
  blogSettingsHydration: Promise<BlogSettingsBundle | null> | undefined
}

type CacheSettingsNonNull = NonNullable<BlogSettingsBundle['cache']>
type CacheBucketKey = keyof CacheSettingsNonNull['cache']

function isCacheBucketSlotLike(value: unknown): value is CacheBucketSlot {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { prefix?: unknown }).prefix === 'string' &&
    typeof (value as { ttlSeconds?: unknown }).ttlSeconds === 'number'
  )
}

function withCacheFallbacks(value: CacheSettingsNonNull): CacheSettingsNonNull {
  const cache = value.cache as Partial<CacheSettingsNonNull['cache']>
  const fallback = CACHE_BUCKET_FALLBACKS as Record<CacheBucketKey, CacheBucketSlot>
  return {
    ...value,
    cache: {
      og: isCacheBucketSlotLike(cache.og) ? cache.og : fallback.og,
      calendar: isCacheBucketSlotLike(cache.calendar) ? cache.calendar : fallback.calendar,
      avatar: isCacheBucketSlotLike(cache.avatar) ? cache.avatar : fallback.avatar,
      imageMeta: isCacheBucketSlotLike(cache.imageMeta) ? cache.imageMeta : fallback.imageMeta,
      embeddingSearch: isCacheBucketSlotLike(cache.embeddingSearch) ? cache.embeddingSearch : fallback.embeddingSearch,
      searchResult: isCacheBucketSlotLike(cache.searchResult) ? cache.searchResult : fallback.searchResult,
    },
  }
}

// `BLOG_SETTINGS_SNAPSHOT_SLOT` is the cross-module bridge between the
// shared reader and the server-only writer in
// `@/server/domains/settings/snapshot`. The export is INTENTIONALLY namespaced
// under a non-obvious symbol so accidental consumers — anything that
// isn't the snapshot writer — can't import it without thinking. The
// snapshot writer re-exports a typed `set…ForServer()` helper that
// uses this slot internally; the `set…` functions are not exposed on
// the shared module's public surface.
//
// Tests that need to bypass the writer (because their `vi.mock` call
// would otherwise replace it with a stub) can reach for the same
// helper via the snapshot module's `setBlogSettingsBundleForTests`
// export, which keeps the test path inside the type system.
export interface BlogSettingsSnapshotSlot {
  read: () => BlogSettingsBundle | null
  write: (value: BlogSettingsBundle | null | undefined) => void
  readHydration: () => Promise<BlogSettingsBundle | null> | undefined
  writeHydration: (value: Promise<BlogSettingsBundle | null> | undefined) => void
}

export const BLOG_SETTINGS_SNAPSHOT_SLOT: BlogSettingsSnapshotSlot = {
  read: () => globalForSnapshot.blogSettingsSnapshot ?? null,
  write: (value) => {
    globalForSnapshot.blogSettingsSnapshot = value
  },
  readHydration: () => globalForSnapshot.blogSettingsHydration,
  writeHydration: (value) => {
    globalForSnapshot.blogSettingsHydration = value
  },
}

/**
 * Synchronous accessor for the bucketed settings bundle. Returns
 * `null` when no DB rows have been written yet (i.e. the install flow
 * hasn't been completed) AND nothing else has populated the snapshot
 * slot. Individual section fields inside the bundle may also be `null`
 * for sections the admin hasn't visited yet.
 *
 * Server-side this is a hot path that runs on every request through
 * `requireBlogSettingsSection()`. Client-side this returns `null`
 * unless the snapshot is being explicitly populated for a test; UI
 * components must read settings through the per-section React contexts
 * (`useFooterSettings`, …) instead of this helper.
 */
export function getBlogSettingsBundleSync(): BlogSettingsBundle | null {
  const raw = BLOG_SETTINGS_SNAPSHOT_SLOT.read()
  if (raw === null) {
    return null
  }
  return raw
}

/**
 * Strict accessor for the bundle. Throws when the snapshot has not
 * been hydrated yet — code paths reaching this far past the install
 * gate should never see `null`, so a regression here is a programmer
 * error worth surfacing loudly.
 */
export function requireBlogSettingsBundle(): BlogSettingsBundle {
  const bundle = getBlogSettingsBundleSync()
  if (bundle === null) {
    throw new Error('Blog settings have not been hydrated yet. The install gate should have intercepted this request.')
  }
  return bundle
}

/**
 * Strict per-section accessor for the bundle. Same gate semantics as
 * `requireBlogSettingsBundle` and additionally asserts the requested
 * section row was seeded. Saves the caller from inlining either a
 * non-null assertion (`!`) or a manual `if (section === null) throw`
 * at every call site that reaches into `requireBlogSettingsBundle()`.
 *
 * The install flow seeds every section up front (and
 * `loadSettingsFromDb` lazily backfills any missing optional section
 * before returning the snapshot — see AGENTS.md §"Configuration &
 * Install Gate"), so post-install this assertion can only fail if a
 * row was manually truncated.
 *
 * Example:
 *
 *   const content = requireBlogSettingsSection('content')
 *   const total = content.pagination.posts
 */
export function requireBlogSettingsSection<K extends keyof BlogSettingsBundle>(
  section: K,
): NonNullable<BlogSettingsBundle[K]> {
  const value = requireBlogSettingsBundle()[section]
  if (value === null) {
    throw new Error(
      `Blog settings section '${section}' is missing from the snapshot. ` +
        'The install flow seeds every section up front, so this usually ' +
        'means a row was manually truncated. Re-run install or restore from backup.',
    )
  }
  return value
}

export function getCacheSettings(): NonNullable<BlogSettingsBundle['cache']> {
  return withCacheFallbacks(requireBlogSettingsSection('cache'))
}
