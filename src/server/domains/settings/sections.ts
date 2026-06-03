import { z } from 'zod'

import type { UpdateSettingsInput } from '@/shared/config/contracts'
import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'

import { analyticsSchema } from '@/server/domains/settings/schemas/analytics'
import { assetsSchema } from '@/server/domains/settings/schemas/assets'
import { backupSchema } from '@/server/domains/settings/schemas/backup'
import { cacheSchema } from '@/server/domains/settings/schemas/cache'
import { commentsSchema } from '@/server/domains/settings/schemas/comments'
import { contentSchema } from '@/server/domains/settings/schemas/content'
import { fontsSchema } from '@/server/domains/settings/schemas/fonts'
import { generalSchema } from '@/server/domains/settings/schemas/general'
import { limitsSchema } from '@/server/domains/settings/schemas/limits'
import { mailSchema } from '@/server/domains/settings/schemas/mail'
import { navigationSchema } from '@/server/domains/settings/schemas/navigation'
import { rateLimitSchema } from '@/server/domains/settings/schemas/rate-limit'
import { searchSchema } from '@/server/domains/settings/schemas/search'
import { securitySchema } from '@/server/domains/settings/schemas/security'
import { seoSchema } from '@/server/domains/settings/schemas/seo'
import { sidebarSchema } from '@/server/domains/settings/schemas/sidebar'
import { socialsSchema } from '@/server/domains/settings/schemas/socials'
import { DomainError } from '@/server/infra/http/errors'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

export { SETTINGS_SECTIONS }
export type { SettingsSection, UpdateSettingsInput }

// Section registry. Single source of truth for every settings section
// and its four relationships:
//
//   1. `scope`    — the `setting.scope` row that holds this section.
//   2. `schema`   — the Zod validator the admin update endpoint uses.
//   3. `key`      — the bundle field this section maps to in
//                   `BlogSettingsBundle` (also the React-context name on
//                   the UI side).
//   4. `defaults` — the seed payload the install flow writes when the
//                   section has no admin-provided values. `null` means
//                   the section requires user input (general, assets)
//                   contents directly. Every other section ships with a
//                   sensible starter document so the very first request
//                   after install can render without throwing from the
//                   strict per-section hooks (`useFooterSettings()`,
//                   `useNavigationSettings()`, …) before the admin has
//                   visited each settings tab.
//
// `service.ts`, `snapshot.ts`, and the install seed all import this
// registry instead of hard-coding the scope strings, so renaming a
// section (or adding an 11th) is a one-line change here.

export interface SectionMeta<
  S extends z.ZodType = z.ZodType,
  K extends keyof BlogSettingsBundle = keyof BlogSettingsBundle,
> {
  /** DB scope key, e.g. `blog.general`. */
  scope: string
  /** Zod schema validating the inbound admin payload. */
  schema: S
  /** Bundle field this section populates on the in-memory snapshot. */
  key: K
  /**
   * Install-time seed payload. `null` means the section requires user
   * input (the install form provides it). A non-null value MUST already
   * satisfy `schema` — see the install seed's `safeParse` defence in
   * depth and the `service.settings — sections.defaults` test.
   */
  defaults: Record<string, unknown> | null
}

// Sensible-default seed payloads for the 9 optional sections. Each
// payload is shaped to satisfy its section's Zod schema verbatim so the
// install flow can write it through `upsertSetting` without any extra
// massaging. Keep these values conservative — empty arrays / disabled
// integrations / 1-day TTLs — so a fresh deployment looks "off" until
// the admin opts into each surface from the matching `/admin/
// settings/<section>` page. (`assets` and `general` carry `defaults: null`
const navigationDefaults = { navigation: { sideNav: [], footerNav: [] } } as const
const socialsDefaults = { socials: [] } as const
const contentDefaults = {
  pagination: { posts: 10, category: 10, tags: 10, search: 10 },
  feed: { full: false, size: 20 },
  post: { sort: 'desc' as const, sortBy: 'publishedAt' as const, featureEnabled: false },
  footnotes: { sectionTitle: '尾声礼记' },
} as const
const sidebarDefaults = {
  sidebar: {
    widgets: [
      { type: 'search' as const, enabled: false },
      { type: 'recentPosts' as const, enabled: false, count: 5 },
      { type: 'recentComments' as const, enabled: false, count: 5 },
      { type: 'randomTags' as const, enabled: false, count: 20 },
      { type: 'todayCalendar' as const, enabled: false },
    ],
  },
} as const
const commentsDefaults = {
  comments: {
    size: 10,
    // Gravatar's HTTPS endpoint is the historical default mirror; the
    // admin can swap in a regional mirror (e.g. `gravatar.loli.net`)
    // from `/admin/settings/comments` without dropping a row.
    avatar: { mirror: 'https://www.gravatar.com/avatar', size: 80 },
    tokenTtlSeconds: 1800,
  },
} as const
const seoDefaults = {
  toc: { minHeadingLevel: 2, maxHeadingLevel: 4 },
  og: { width: 1200, height: 630 },
} as const
const mailDefaults = {
  // Disabled by default — the sender must supply a Zeabur ZSend host +
  // API key + verified sender address before any outgoing mail flows.
  // `host`/`sender` carry placeholders so the schema's `min(1)` and
  // `email` constraints pass: an empty `mail.host` would reject the
  // seed. The admin form treats both fields as freely editable.
  mail: { enabled: false, host: 'api.zeabur.com', apiKey: '', sender: 'noreply@example.com' },
} as const
// `:`-suffixed prefixes are the safe shape: the cache schema rejects
// any prefix that's a strict prefix of (or equal to) another bucket's
// prefix, AND any prefix that collides with the reserved `session:` /
// `rate-limit:` / `avatar-status:` surfaces. The five default
// prefixes below clear both bars without overlapping each other.
//
// `image-meta:` is routed through Redis so SSR
// replicas share warmth and so admins can clear them from
// `/admin/settings/cache`. The 5-minute LRU these replaced was a
// process-local safety net — bumping the floor to 1 hour matches the
// schema bound and is fine because both writers explicitly invalidate
// on the underlying mutation (image upload / N/A respectively).
const cacheDefaults = {
  cache: {
    og: { prefix: 'og:', ttlSeconds: 60 * 60 * 24 },
    calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 * 24 },
    avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 },
    imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },

    embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
    searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
  },
} as const
// Rate-limit defaults mirror the historical hard-coded values that
// shipped before this surface was admin-editable, so an upgrading
// deployment behaves identically until the admin opts to tune the
// caps from `/admin/settings/rate-limit`:
//
//   * Sign-in IP — 5 attempts / 30 minutes (login lockout).
//   * Comment IP — 12 attempts / 1 hour (anonymous comment spam wall).
//   * Comment email — 8 attempts / 1 hour (mailbox-level spam wall).
//   * Like increase IP — 30 likes / 1 hour. New surface; sized so a
//     normal reader scrolling through a blog roll never trips it,
//     but a script hammering a single page burns through the cap in
//     a couple of seconds and stops creating `like` token rows.
export const SECTION_REGISTRY = {
  general: { scope: 'blog.general', schema: generalSchema, key: 'siteIdentity', defaults: null },
  // `assets` packs the music CDN host AND the S3 bucket credentials AND
  // the upload limits. `defaults` is `null` because the install flow
  // requires a real `asset.host` (an empty default would never satisfy
  // and the registry contributes the conservative S3 starter (toggle
  // OFF, empty credentials, 8 MiB / quality 82) through the install
  // seed below. The admin then opens `/admin/settings/assets` to
  // flip the storage toggle on and supply credentials when ready.
  assets: { scope: 'blog.assets', schema: assetsSchema, key: 'assets', defaults: null },
  navigation: {
    scope: 'blog.navigation',
    schema: navigationSchema,
    key: 'navigation',
    defaults: navigationDefaults,
  },
  socials: {
    scope: 'blog.socials',
    schema: socialsSchema,
    key: 'socials',
    defaults: socialsDefaults,
  },
  content: {
    scope: 'blog.content',
    schema: contentSchema,
    key: 'content',
    defaults: contentDefaults,
  },
  sidebar: {
    scope: 'blog.sidebar',
    schema: sidebarSchema,
    key: 'sidebar',
    defaults: sidebarDefaults,
  },
  comments: {
    scope: 'blog.comments',
    schema: commentsSchema,
    key: 'comments',
    defaults: commentsDefaults,
  },
  seo: { scope: 'blog.seo', schema: seoSchema, key: 'seo', defaults: seoDefaults },
  mail: { scope: 'blog.mail', schema: mailSchema, key: 'mail', defaults: mailDefaults },
  cache: { scope: 'blog.cache', schema: cacheSchema, key: 'cache', defaults: cacheDefaults },
  // `rateLimit` is a pure runtime-policy section: every bucket has a
  // schema-validated default mirroring the historical hard-coded
  // values, so an upgrading deployment that hits the
  // `backfillMissingSectionDefaults()` path picks up the current
  // behaviour automatically without admin intervention.
  rateLimit: {
    scope: 'blog.rateLimit',
    schema: rateLimitSchema,
    key: 'rateLimit',
    defaults: rateLimitDefaults,
  },
  search: {
    scope: 'blog.search',
    schema: searchSchema,
    key: 'search',
    defaults: {
      search: {
        enabled: false,
        mode: 'like',
        endpoint: '',
        apiKey: '',
        model: 'text-embedding-3-small',
        similarityThreshold: 0.5,
      },
    },
  },
  fonts: {
    scope: 'blog.fonts',
    schema: fontsSchema,
    key: 'fonts',
    // Empty defaults — every consumer degrades silently to fallback
    // system fonts until the admin pastes paths at
    // `/admin/settings/fonts`. So a fresh install renders the
    // home / archives / OG image without throwing, just with system
    // typography.
    defaults: {
      og: { path: '', family: '' },
      calendar: { path: '', family: '' },
      globalCss: [],
      postCss: [],
    },
  },
  backup: {
    scope: 'blog.backup',
    schema: backupSchema,
    key: 'backup',
    defaults: {
      scheduled: { enabled: false, frequency: 'daily', hour: 3, minute: 0 },
      retention: { enabled: true, days: 30 },
    },
  },
  limits: {
    scope: 'blog.limits',
    schema: limitsSchema,
    key: 'limits',
    defaults: {
      maxRequestBodySize: 10 * 1024 * 1024,
      sessionMaxAge: 60 * 60 * 24 * 30,
      auditLogDbRetentionDays: 30,
      auditLogArchiveRetentionDays: 180,
    },
  },
  analytics: {
    scope: 'blog.analytics',
    schema: analyticsSchema,
    key: 'analytics',
    defaults: {
      analytics: { trackAdmin: false, keepBotRows: false },
    },
  },
  security: {
    scope: 'blog.security',
    schema: securitySchema,
    key: 'security',
    defaults: {
      csrf: { enabled: true, exemptPaths: [] },
      // Empty origins = mirror mode (reflect request Origin header).
      // Safe default for same-origin deployments; the admin adds
      // specific origins when a CDN or third-party integration
      // needs cross-origin access.
      cors: { enabled: false, origins: [] },
      otp: { enabled: false },
    },
  },
} as const satisfies Record<SettingsSection, SectionMeta>

// Conservative starter S3 configuration the install flow writes for the
// `blog.assets` row alongside the user-supplied `asset.host` / `asset.scheme`.
// The toggle is OFF and the bucket fields are empty so a fresh install
// never tries to ship to a non-existent S3 endpoint; the admin flips
// the toggle on from `/admin/settings/assets` after entering valid
// credentials.
export const ASSETS_STORAGE_INSTALL_DEFAULTS = {
  storage: {
    enabled: false,
    endpoint: '',
    region: '',
    bucket: '',
    accessKeyId: '',
    secretAccessKey: '',
    forcePathStyle: false,
    urlTemplate: '',
  },
  upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
} as const

/** Common prefix used to fetch every settings row in one SELECT. */
export const SETTINGS_SCOPE_PREFIX = 'blog.'

/**
 * Reverse lookup: given a `scope` string from the DB, return the
 * matching section id (or `null` if the row belongs to some other
 * surface we don't recognise — defensive against stale rows).
 */
export function sectionFromScope(scope: string): SettingsSection | null {
  for (const section of SETTINGS_SECTIONS) {
    if (SECTION_REGISTRY[section].scope === scope) {
      return section
    }
  }
  return null
}

// Wire envelope used by the admin `updateSettings` PATCH endpoint.
// Defined here (not in `schema.ts`) so it can `z.enum(SETTINGS_SECTIONS)`
// off the registry without creating a `schema.ts` ↔ `sections.ts`
// circular import.
export const updateSettingsSchema = z.object({
  section: z.enum([...SETTINGS_SECTIONS] as [SettingsSection, ...SettingsSection[]]),
  payload: z.unknown(),
})

/**
 * Validate every section's `defaults` payload against its own
 * `schema`, returning the list of `(section, parsed-payload)` pairs
 * for sections that ship with a non-null seed. Throws
 * `Error('blog.<section> defaults invalid')` when any default fails
 * its schema — that's a programmer bug in this file, not a runtime
 * data error, so loud failure is the right behaviour.
 *
 * Used by:
 *   - `signUpInitialAdminWithSession()` (first-time install).
 *   - `backfillMissingSectionDefaults()` (existing deployments that
 *     pre-date the "seed all sections at install" change).
 */
export function buildDefaultSectionPayloads(): {
  section: SettingsSection
  payload: Record<string, unknown>
}[] {
  const out: { section: SettingsSection; payload: Record<string, unknown> }[] = []
  for (const section of SETTINGS_SECTIONS) {
    const meta = SECTION_REGISTRY[section]
    if (meta.defaults === null) {
      continue
    }
    const check = meta.schema.safeParse(meta.defaults)
    if (!check.success) {
      // Surface the first issue path in the message so a regression
      // pinpoints the exact field that drifted.
      const first = check.error.issues[0]
      const path = first ? first.path.join('.') : '<unknown>'
      throw new DomainError(
        'INTERNAL',
        `${meta.scope} defaults invalid at \`${path}\`: ${first?.message ?? 'unknown reason'}`,
      )
    }
    out.push({ section, payload: check.data as Record<string, unknown> })
  }
  return out
}
