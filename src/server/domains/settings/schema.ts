import { z } from 'zod'

import type { CacheBucketId } from '@/shared/types/cache'

import { isSupportedTimeZone } from '@/server/domains/settings/timezones'
import { SOCIAL_NETWORK_META, SOCIAL_NETWORKS } from '@/shared/config/socials'
import { httpUrlOrEmptyStringSchema } from '@/shared/utils/safe-url'

// Section-scoped Zod schemas mirror the way the admin UI is split: every
// settings page sends only its own slice through `updateSettings`, so the
// validator can stay tightly bounded. The union is reassembled via
// `BlogSettingsPatch` for the storage layer.

export type { SocialNetwork } from '@/shared/config/socials'
export { SOCIAL_NETWORKS }

const sortOrderSchema = z.enum(['asc', 'desc'])

// `locale` is a BCP 47 tag (e.g. `zh-CN`); `timeZone` is an IANA name
// (e.g. `Asia/Shanghai`); `timeFormat` is the project's small token
// language consumed by `formatLocalDate` (`yyyy LL MM dd HH mm`). Date
// fields live alongside site identity now so `/admin/settings/general`
// owns every "what does the site call itself, in what language" knob in
// one place.
export const generalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(240),
  website: z.url(),
  keywords: z.array(z.string().trim().min(1).max(60)).max(20),
  author: z.object({
    name: z.string().trim().min(1).max(60),
    email: z.email(),
    url: z.url(),
  }),
  locale: z.string().trim().min(2).max(35),
  // The dropdown UI only offers values from `Intl.supportedValuesOf`,
  // but we still validate at the perimeter so a hand-crafted POST that
  // bypasses the picker can't smuggle a bogus zone into the JSONB
  // document — the formatters would silently throw at render time.
  timeZone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine(isSupportedTimeZone, { message: '必须是 IANA 时区名（如 Asia/Shanghai、UTC）' }),
  timeFormat: z.string().trim().min(1).max(40),
  initialYear: z.coerce.number().int().min(1970).max(9999),
  icpNo: z.string().trim().max(60).optional(),
  moeIcpNo: z.string().trim().max(60).optional(),
})
export type GeneralInput = z.infer<typeof generalSchema>

export const navigationSchema = z.object({
  navigation: z.object({
    sideNav: z
      .array(
        z.object({
          text: z.string().trim().min(1).max(40),
          link: z.string().trim().min(1).max(200),
          target: z.string().trim().max(20).optional(),
        }),
      )
      .max(20),
    footerNav: z
      .array(
        z.object({
          type: z.enum(['social', 'themeToggle', 'search']),
          network: z.enum(SOCIAL_NETWORKS).optional(),
        }),
      )
      .max(5),
  }),
})
export type NavigationInput = z.infer<typeof navigationSchema>

// Each row is pinned to a platform from the closed `SOCIAL_NETWORKS`
// list, and the display `type` is forced to the canonical type for that
// platform (WeChat / QQ → qrcode, others → link). The admin form only
// surfaces these as a fixed badge — the schema is the second line of
// defence against a hand-crafted payload that tries to mix and match.
//
// The `superRefine` then enforces uniqueness so every platform appears
// at most once: the editor's "添加社交链接" menu already hides used
// platforms, but a stale tab or a direct API call could otherwise sneak
// duplicates past the UI.
export const socialsSchema = z
  .object({
    socials: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(60),
          network: z.enum(SOCIAL_NETWORKS),
          type: z.enum(['link', 'qrcode']),
          title: z.string().trim().max(120).optional(),
          link: httpUrlOrEmptyStringSchema,
        }),
      )
      .max(SOCIAL_NETWORKS.length),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.socials.forEach((row, index) => {
      const expectedType = SOCIAL_NETWORK_META[row.network].type
      if (row.type !== expectedType) {
        ctx.addIssue({
          code: 'custom',
          path: ['socials', index, 'type'],
          message: `「${SOCIAL_NETWORK_META[row.network].label}」固定使用 \`${expectedType}\` 展示方式`,
        })
      }
      if (seen.has(row.network)) {
        ctx.addIssue({
          code: 'custom',
          path: ['socials', index, 'network'],
          message: `「${SOCIAL_NETWORK_META[row.network].label}」已经添加过，请直接编辑已有那条`,
        })
      } else {
        seen.add(row.network)
      }
    })
  })
export type SocialsInput = z.infer<typeof socialsSchema>

export const contentSchema = z.object({
  pagination: z.object({
    posts: z.coerce.number().int().min(1).max(100),
    category: z.coerce.number().int().min(1).max(100),
    tags: z.coerce.number().int().min(1).max(100),
    search: z.coerce.number().int().min(1).max(100),
  }),
  feed: z.object({
    full: z.coerce.boolean(),
    size: z.coerce.number().int().min(1).max(100),
  }),
  post: z.object({
    sort: sortOrderSchema,
    sortBy: z.enum(['publishedAt', 'updatedAt']).default('publishedAt'),
    featureEnabled: z.coerce.boolean().default(false),
  }),
  footnotes: z
    .object({
      sectionTitle: z.string().trim().min(1).max(120),
    })
    .default({ sectionTitle: '尾声礼记' }),
})
export type ContentInput = z.infer<typeof contentSchema>

export const sidebarSchema = z.object({
  sidebar: z.object({
    widgets: z.array(
      z.object({
        type: z.enum(['search', 'recentPosts', 'recentComments', 'randomTags', 'todayCalendar']),
        enabled: z.coerce.boolean(),
        count: z.coerce.number().int().min(0).max(100).optional(),
      }),
    ),
  }),
})
export type SidebarInput = z.infer<typeof sidebarSchema>

export const commentsSchema = z.object({
  comments: z.object({
    size: z.coerce.number().int().min(1).max(100),
    avatar: z.object({
      mirror: z.url(),
      size: z.coerce.number().int().min(16).max(512),
    }),
    tokenTtlSeconds: z.coerce.number().int().min(60).max(86400).default(1800),
  }),
})
export type CommentsInput = z.infer<typeof commentsSchema>

export const seoSchema = z.object({
  toc: z.object({
    minHeadingLevel: z.coerce.number().int().min(1).max(6),
    maxHeadingLevel: z.coerce.number().int().min(1).max(6),
  }),
  // OG canvas dimensions. The renderer (`@/server/render/og/render`) reads
  // these at request time, so editing them here takes effect on the next
  // OG image generation. Bound by sensible X/Facebook card limits
  // (Facebook recommends ≥600×315; X caps at 4096×4096).
  og: z.object({
    width: z.coerce.number().int().min(600).max(4096),
    height: z.coerce.number().int().min(315).max(4096),
  }),
})
export type SeoInput = z.infer<typeof seoSchema>

// Mail / Zeabur ZSend integration. The host is bounded to a hostname
// (no scheme — the sender hard-codes `https://`), the API key is left
// permissive because Zeabur tokens have no documented format, and the
// sender must be a valid email so the upstream API doesn't 4xx the
// payload before we get any feedback.
//
// `apiKey` is optional so the admin form can save other fields without
// re-pasting the secret on every edit: the perimeter treats `undefined`
// (or omitted) as "keep the existing value" and any string (including
// empty) as a deliberate overwrite. The "always overwrite empty" pivot
// happens in `applySectionPatch`, not here, so the schema stays a pure
// shape validator.
export const mailSchema = z.object({
  mail: z.object({
    enabled: z.coerce.boolean(),
    host: z.string().trim().min(1).max(253),
    apiKey: z.string().trim().max(512).optional(),
    sender: z.union([z.literal(''), z.email()]),
  }),
})
export type MailInput = z.infer<typeof mailSchema>

// Payload for the admin "send test email" button — independent of the
// section-update channel because the action is a side-effect, not a
// document write.
export const sendTestMailSchema = z.object({
  to: z.email(),
})
export type SendTestMailInput = z.infer<typeof sendTestMailSchema>

// Per-bucket Redis cache configuration. Each bucket owns a stable id
// (`og` / `calendar` / `avatar`) baked into the writers; the editor can
// only rename the PREFIX and tune the TTL. The prefix has to end with
// `:` so the SCAN MATCH `${prefix}*` can never reach into a
// neighbouring bucket's namespace by accident (e.g. an `og` prefix
// could otherwise match `ogre-foo`).
//
// "RESERVED_PREFIXES" enumerates surfaces that the admin panel must
// NEVER let an editor overwrite — the session and rate-limit caches
// both depend on stable key shapes for safety reasons (clearing
// sessions logs everyone out; clearing rate-limit lets bad actors
// retry immediately). `avatar-status` is the historical two-key
// avatar layout — keeping it reserved means a future archeology dig
// can't be silently shadowed.
export const RESERVED_CACHE_PREFIXES: readonly string[] = ['session:', 'rate-limit:', 'avatar-status:']

const PREFIX_PATTERN = /^[a-z0-9_-]+:$/i
// 1 hour ≤ TTL ≤ 30 days. The lower bound keeps a typo from making a
// cache useless (sub-minute TTL would treadmill regenerations and
// hammer Redis); the upper bound keeps stale renders from outliving a
// content rename for too long.
const MIN_TTL_SECONDS = 60 * 60
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30

const cacheBucketSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(PREFIX_PATTERN, '前缀只能包含字母 / 数字 / `_` / `-`，且必须以 `:` 结尾'),
  ttlSeconds: z.coerce.number().int().min(MIN_TTL_SECONDS).max(MAX_TTL_SECONDS),
})

export const cacheSchema = z
  .object({
    cache: z.object({
      og: cacheBucketSchema,
      calendar: cacheBucketSchema,
      avatar: cacheBucketSchema,
      // Image metadata lookups (storagePath → ImageRow) and comment
      // markdown render results both used to live in a process-local
      // `lru-cache`, which meant every server replica re-warmed the
      // same data and a deploy nuked them entirely. Routing them
      // through Redis like the other buckets gives us shared warmth
      // and one-click admin invalidation; the writers still front the
      // network round-trip with `createInflight` so concurrent
      // requests for the same key collapse to a single load.
      imageMeta: cacheBucketSchema,
      embeddingSearch: cacheBucketSchema,
      searchResult: cacheBucketSchema,
    }),
  })
  .superRefine((value, ctx) => {
    const buckets = value.cache
    const entries: { id: CacheBucketId; prefix: string }[] = [
      { id: 'og', prefix: buckets.og.prefix },
      { id: 'calendar', prefix: buckets.calendar.prefix },
      { id: 'avatar', prefix: buckets.avatar.prefix },
      { id: 'imageMeta', prefix: buckets.imageMeta.prefix },
      { id: 'embeddingSearch', prefix: buckets.embeddingSearch.prefix },
      { id: 'searchResult', prefix: buckets.searchResult.prefix },
    ]

    // Two prefixes "collide" if either is a strict prefix of the other.
    // Equality is the obvious case; the prefix-of case matters because
    // SCAN `og-*` would match keys written under prefix `og-foo-`.
    function collides(a: string, b: string): boolean {
      return a === b || a.startsWith(b) || b.startsWith(a)
    }

    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const left = entries[i]
        const right = entries[j]
        if (left === undefined || right === undefined) {
          continue
        }
        if (collides(left.prefix, right.prefix)) {
          ctx.addIssue({
            code: 'custom',
            path: ['cache', right.id, 'prefix'],
            message: `「${right.id}」的前缀 \`${right.prefix}\` 与「${left.id}」的前缀 \`${left.prefix}\` 冲突，会让 SCAN 互相误伤`,
          })
        }
      }

      const reserved = RESERVED_CACHE_PREFIXES.find((slot) => {
        const entry = entries[i]
        if (entry === undefined) {
          return false
        }
        return collides(entry.prefix, slot)
      })
      if (reserved !== undefined) {
        const entry = entries[i]
        if (entry !== undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['cache', entry.id, 'prefix'],
            message: `\`${entry.prefix}\` 与系统保留前缀 \`${reserved}\` 冲突（session / rate-limit 等不可被管理面板清空）`,
          })
        }
      }
    }
  })
export type CacheSettingsInput = z.infer<typeof cacheSchema>

// Merged "存储配置" section: the music CDN host (consumed by
// `<MusicPlayer>` to fetch APlayer audio + lyrics), the S3-compatible
// storage credentials, and the upload limits for the admin image
// library. Image public URLs share the same `asset.scheme://asset.host`
// base with music metadata, so combining the two keeps the operator
// from having to keep two pages in sync.
//
// Image upload is gated by a single `storage.enabled` toggle:
//
//   - `enabled === false` (default for fresh installs) — uploads are
//     refused at the perimeter with a friendly 503. The admin library
//     UI still lists previously-uploaded rows and the public render
//     pipeline still resolves their public URL using the stored
//     `publicBaseUrl`, so historical S3 rows keep working even after
//     the toggle is flipped off.
//   - `enabled === true` — every field below is required (the schema
//     `superRefine` below enforces it). The runtime upload service
//     hands the buffer to the S3 client.
//
// We deliberately keep the bucket fields nullable when disabled so
// that flipping the toggle off doesn't force the admin to re-paste
// the credentials when they flip it back on later. The admin form
// remembers (and re-submits) the previously-typed values.
//
// `secretAccessKey` follows the same "optional ⇒ keep existing"
// convention as `mail.apiKey`: the admin form sends `undefined` to
// signal "I'm tweaking other fields, don't make me re-paste the
// secret". `applySectionPatch` folds the persisted value back in;
// passing an empty string (or any explicit string) overwrites the
// stored secret.
export const assetsSchema = z
  .object({
    asset: z.object({
      host: z
        .string()
        .trim()
        .min(1)
        .max(253)
        .regex(/^[a-z0-9.-]+$/i, '只能包含字母 / 数字 / `-` / `.`'),
      scheme: z.enum(['http', 'https']),
    }),
    storage: z.object({
      enabled: z.coerce.boolean(),
      endpoint: z.union([z.literal(''), z.url()]),
      region: z.string().trim().max(60),
      bucket: z.string().trim().max(120),
      accessKeyId: z.string().trim().max(255),
      secretAccessKey: z.string().trim().max(512).optional(),
      forcePathStyle: z.coerce.boolean(),
      urlTemplate: z.string().trim().max(500),
    }),
    upload: z.object({
      maxBytes: z.coerce
        .number()
        .int()
        .min(1024)
        .max(50 * 1024 * 1024),
      jpegQuality: z.coerce.number().int().min(40).max(100),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.storage.enabled) {
      return
    }
    // When the toggle is on, every bucket field has to carry a real
    // value. The admin form mirrors these checks client-side so the
    // user never reaches the network in the all-empty case, but a
    // hand-crafted PATCH would otherwise sneak through.
    const required: { key: keyof typeof value.storage; label: string }[] = [
      { key: 'endpoint', label: 'Endpoint' },
      { key: 'region', label: 'Region' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'accessKeyId', label: 'Access Key ID' },
    ]
    for (const { key, label } of required) {
      const fieldValue = value.storage[key]
      if (typeof fieldValue !== 'string' || fieldValue.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['storage', key as string],
          message: `开启 S3 上传时「${label}」必填`,
        })
      }
    }
  })
export type AssetsInput = z.infer<typeof assetsSchema>

// Centralised rate-limiting policy. Every bucket below maps 1:1 to a
// surface in `@/server/infra/rate-limit`:
//
//   * `signInIp`            — `tryRateLimit(ip)` (login form)
//   * `commentPostIp`       — `tryCommentPostRateLimit(ip)` (anonymous comments)
//   * `commentPostEmail`    — `tryCommentPostRateLimitByEmail(email)`
//   * `likeIncreaseIp`      — `tryLikeIncreaseRateLimit(ip)` (post likes)
//   * `inviteIp`            — `tryInviteRateLimit(ip)` (admin invite)
//   * `inviteEmail`         — `tryInviteByEmailRateLimit(adminId, email)`
//   * `passwordResetIp`     — `tryPasswordResetRateLimit(ip)` (lostpassword)
//   * `passwordResetEmail`  — `tryPasswordResetByEmailRateLimit(email)`
//   * `passwordResetTarget` — `tryPasswordResetByTargetRateLimit(userId)`
//
// Bounds rationale:
//
//   * 60s ≤ window ≤ 24h. Sub-minute windows treadmill the counter
//     (the EXPIRE NX wouldn't even land before the TTL ticks); >24h
//     would let one typo lock a returning visitor out for an entire
//     day. The historical hard-coded values (30 min sign-in, 1 h
//     comment IP/email) sit comfortably inside this band.
//   * 1 ≤ maxAttempts ≤ 1000. The lower bound prevents the "0 means
//     deny everyone" footgun; the upper bound is a sanity ceiling
//     (a logged-in visitor clicking "like" once per second for
//     ~16 minutes would still come in under it).
const RATE_LIMIT_MIN_WINDOW = 60
const RATE_LIMIT_MAX_WINDOW = 60 * 60 * 24
const RATE_LIMIT_MIN_ATTEMPTS = 1
const RATE_LIMIT_MAX_ATTEMPTS = 1000

const rateLimitBucketSchema = z.object({
  windowSeconds: z.coerce.number().int().min(RATE_LIMIT_MIN_WINDOW).max(RATE_LIMIT_MAX_WINDOW),
  maxAttempts: z.coerce.number().int().min(RATE_LIMIT_MIN_ATTEMPTS).max(RATE_LIMIT_MAX_ATTEMPTS),
})

export const RATE_LIMIT_BUCKET_KEYS = [
  'signInIp',
  'commentPostIp',
  'commentPostEmail',
  'likeIncreaseIp',
  'inviteIp',
  'inviteEmail',
  'passwordResetIp',
  'passwordResetEmail',
  'passwordResetTarget',
] as const

export const rateLimitSchema = z.object(
  Object.fromEntries(RATE_LIMIT_BUCKET_KEYS.map((key) => [key, rateLimitBucketSchema])),
)
export type RateLimitInput = z.infer<typeof rateLimitSchema>

export const searchSchema = z.object({
  search: z.object({
    enabled: z.coerce.boolean(),
    mode: z.enum(['vector', 'like']).default('like'),
    /** OpenAI-compatible API endpoint. Empty string means use the official OpenAI endpoint. */
    endpoint: z.union([z.literal(''), z.url()]),
    apiKey: z.string().trim().max(512).optional(),
    model: z.string().trim().max(80).default('text-embedding-3-small'),
    similarityThreshold: z.coerce.number().min(0).max(1).default(0.5),
  }),
})
export type SearchInput = z.infer<typeof searchSchema>

// Empty string (Canvas slots) / empty array (CSS slots) == "not
// configured"; every consumer degrades silently. Non-empty URLs must
// parse as absolute — relative paths and `file://` would let an admin
// point the renderer at unintended files on the SSR host.
const fontUrlSchema = z.union([z.literal(''), z.url()])
// CSS list cap: 8 stylesheets per slot is comfortably above any
// realistic font count (typically 1-3) and stops a misconfigured row
// from emitting hundreds of <link> tags. The form trims empty strings
// before save.
const fontCssListSchema = z.array(z.url()).max(8)
export const fontsSchema = z.object({
  og: z.object({ url: fontUrlSchema }),
  calendar: z.object({ url: fontUrlSchema }),
  globalCss: fontCssListSchema,
  postCss: fontCssListSchema,
})
export type FontsInput = z.infer<typeof fontsSchema>

export const backupSchema = z
  .object({
    scheduled: z.object({
      enabled: z.coerce.boolean(),
      frequency: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
      hour: z.coerce.number().int().min(0).max(23).default(3),
      minute: z.union([z.literal(0), z.literal(30)]).default(0),
      dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
      dayOfMonth: z.coerce.number().int().min(1).max(28).optional(),
    }),
    retention: z.object({
      enabled: z.coerce.boolean().default(true),
      days: z.coerce.number().int().min(1).max(365).default(30),
    }),
  })
  .superRefine((value, ctx) => {
    if (!value.scheduled.enabled) {
      return
    }
    if (value.scheduled.frequency === 'weekly' && value.scheduled.dayOfWeek === undefined) {
      ctx.addIssue({ code: 'custom', path: ['scheduled', 'dayOfWeek'], message: '请选择星期几' })
    }
    if (value.scheduled.frequency === 'monthly' && value.scheduled.dayOfMonth === undefined) {
      ctx.addIssue({ code: 'custom', path: ['scheduled', 'dayOfMonth'], message: '请选择每月日期' })
    }
  })
export type BackupInput = z.infer<typeof backupSchema>

export const limitsSchema = z.object({
  maxRequestBodySize: z.coerce
    .number()
    .int()
    .min(1024)
    .max(100 * 1024 * 1024)
    .default(10 * 1024 * 1024),
  sessionMaxAge: z.coerce
    .number()
    .int()
    .min(60)
    .max(365 * 24 * 60 * 60)
    .default(60 * 60 * 24 * 30),
  auditLogDbRetentionDays: z.coerce.number().int().min(1).max(90).default(30),
  auditLogArchiveRetentionDays: z.coerce
    .number()
    .int()
    .min(1)
    .max(365 * 2)
    .default(180),
})
export type LimitsInput = z.infer<typeof limitsSchema>

/** Bounds re-exported so the admin form can mirror them in `min`/`max` attributes. */
export const RATE_LIMIT_BOUNDS = {
  windowSeconds: { min: RATE_LIMIT_MIN_WINDOW, max: RATE_LIMIT_MAX_WINDOW },
  maxAttempts: { min: RATE_LIMIT_MIN_ATTEMPTS, max: RATE_LIMIT_MAX_ATTEMPTS },
} as const

// The section discriminator (`SETTINGS_SECTIONS`), per-section schema
// map (`SECTION_REGISTRY`), and admin PATCH envelope
// (`updateSettingsSchema`) all live in `@/server/domains/settings/sections.ts`
// so the section name → DB scope → Zod schema → bundle key
// relationship is encoded in a single registry. This module owns only
// the per-section Zod schemas above plus side-effect schemas
// (`sendTestMailSchema`).
