import type { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

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
import { newsletterSchema } from '@/server/domains/settings/schemas/newsletter'
import { rateLimitSchema } from '@/server/domains/settings/schemas/rate-limit'
import { searchSchema } from '@/server/domains/settings/schemas/search'
import { securitySchema } from '@/server/domains/settings/schemas/security'
import { seoSchema } from '@/server/domains/settings/schemas/seo'
import { sidebarSchema } from '@/server/domains/settings/schemas/sidebar'
import { socialsSchema } from '@/server/domains/settings/schemas/socials'
import {
  analyticsDefaults,
  backupDefaults,
  cacheDefaults,
  commentsDefaults,
  contentDefaults,
  fontsDefaults,
  limitsDefaults,
  mailDefaults,
  navigationDefaults,
  newsletterDefaults,
  searchDefaults,
  securityDefaults,
  seoDefaults,
  sidebarDefaults,
  socialsDefaults,
} from '@/server/domains/settings/sections/defaults'
import { DomainError } from '@/server/infra/http/errors'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'
import { unsafeCast } from '@/shared/utils/unsafe-cast'

export interface SectionMeta<
  S extends z.ZodType = z.ZodType,
  K extends keyof BlogSettingsBundle = keyof BlogSettingsBundle,
> {
  scope: string
  schema: S
  key: K
  defaults: Record<string, unknown> | null
}

export const SECTION_REGISTRY = {
  general: { scope: 'blog.general', schema: generalSchema, key: 'siteIdentity', defaults: null },
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
  newsletter: {
    scope: 'blog.newsletter',
    schema: newsletterSchema,
    key: 'newsletter',
    defaults: newsletterDefaults,
  },
  cache: { scope: 'blog.cache', schema: cacheSchema, key: 'cache', defaults: cacheDefaults },
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
    defaults: searchDefaults,
  },
  fonts: {
    scope: 'blog.fonts',
    schema: fontsSchema,
    key: 'fonts',
    defaults: fontsDefaults,
  },
  backup: {
    scope: 'blog.backup',
    schema: backupSchema,
    key: 'backup',
    defaults: backupDefaults,
  },
  limits: {
    scope: 'blog.limits',
    schema: limitsSchema,
    key: 'limits',
    defaults: limitsDefaults,
  },
  analytics: {
    scope: 'blog.analytics',
    schema: analyticsSchema,
    key: 'analytics',
    defaults: analyticsDefaults,
  },
  security: {
    scope: 'blog.security',
    schema: securitySchema,
    key: 'security',
    defaults: securityDefaults,
  },
} as const satisfies Record<SettingsSection, SectionMeta>

/** Common prefix used to fetch every settings row in one SELECT. */
export const SETTINGS_SCOPE_PREFIX = 'blog.'

/**
 * Reverse lookup: given a `scope` string from the DB, return the
 * matching section id (or `null` if the row belongs to some other
 * surface we don't recognise).
 */
export function sectionFromScope(scope: string): SettingsSection | null {
  for (const section of SETTINGS_SECTIONS) {
    if (SECTION_REGISTRY[section].scope === scope) {
      return section
    }
  }
  return null
}

/**
 * Validate one section's seed `defaults` against its own `schema`,
 * returning the parsed payload. Throws a DomainError when the seed
 * drifted from the schema. This is the single defaults validator: both
 * `buildDefaultSectionPayloads` (hydration backfill) and the write
 * path's merge base (`services/core.ts`) go through it.
 */
export function validateSectionDefaults(meta: SectionMeta): Record<string, unknown> {
  const check = meta.schema.safeParse(meta.defaults)
  if (!check.success) {
    const first = check.error.issues[0]
    const path = first ? first.path.join('.') : '<unknown>'
    throw new DomainError(
      'INTERNAL',
      `${meta.scope} defaults invalid at \`${path}\`: ${first?.message ?? 'unknown reason'}`,
    )
  }
  return unsafeCast<Record<string, unknown>>(check.data)
}

/**
 * Validate every section's `defaults` payload against its own
 * `schema`, returning the list of `(section, parsed-payload)` pairs
 * for sections that ship with a non-null seed.
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
    out.push({ section, payload: validateSectionDefaults(meta) })
  }
  return out
}

// Compile-time parity: each section schema's OUTPUT type must equal its
// bundle-slot DTO — hydration writes `parsed.data` straight into the
// bundle (`services/hydrate.ts:81`), so drift here means the DTO lies.
type _generalSchemaDtoParity = Assert<
  Equals<z.infer<typeof generalSchema>, NonNullable<BlogSettingsBundle['siteIdentity']>>
>
type _assetsSchemaDtoParity = Assert<Equals<z.infer<typeof assetsSchema>, NonNullable<BlogSettingsBundle['assets']>>>
type _navigationSchemaDtoParity = Assert<
  Equals<z.infer<typeof navigationSchema>, NonNullable<BlogSettingsBundle['navigation']>>
>
type _socialsSchemaDtoParity = Assert<Equals<z.infer<typeof socialsSchema>, NonNullable<BlogSettingsBundle['socials']>>>
type _contentSchemaDtoParity = Assert<Equals<z.infer<typeof contentSchema>, NonNullable<BlogSettingsBundle['content']>>>
type _sidebarSchemaDtoParity = Assert<Equals<z.infer<typeof sidebarSchema>, NonNullable<BlogSettingsBundle['sidebar']>>>
type _commentsSchemaDtoParity = Assert<
  Equals<z.infer<typeof commentsSchema>, NonNullable<BlogSettingsBundle['comments']>>
>
type _seoSchemaDtoParity = Assert<Equals<z.infer<typeof seoSchema>, NonNullable<BlogSettingsBundle['seo']>>>
type _mailSchemaDtoParity = Assert<Equals<z.infer<typeof mailSchema>, NonNullable<BlogSettingsBundle['mail']>>>
type _newsletterSchemaDtoParity = Assert<
  Equals<z.infer<typeof newsletterSchema>, NonNullable<BlogSettingsBundle['newsletter']>>
>
type _cacheSchemaDtoParity = Assert<Equals<z.infer<typeof cacheSchema>, NonNullable<BlogSettingsBundle['cache']>>>
type _rateLimitSchemaDtoParity = Assert<
  Equals<z.infer<typeof rateLimitSchema>, NonNullable<BlogSettingsBundle['rateLimit']>>
>
type _searchSchemaDtoParity = Assert<Equals<z.infer<typeof searchSchema>, NonNullable<BlogSettingsBundle['search']>>>
type _fontsSchemaDtoParity = Assert<Equals<z.infer<typeof fontsSchema>, NonNullable<BlogSettingsBundle['fonts']>>>
type _backupSchemaDtoParity = Assert<Equals<z.infer<typeof backupSchema>, NonNullable<BlogSettingsBundle['backup']>>>
type _limitsSchemaDtoParity = Assert<Equals<z.infer<typeof limitsSchema>, NonNullable<BlogSettingsBundle['limits']>>>
type _analyticsSchemaDtoParity = Assert<
  Equals<z.infer<typeof analyticsSchema>, NonNullable<BlogSettingsBundle['analytics']>>
>
type _securitySchemaDtoParity = Assert<
  Equals<z.infer<typeof securitySchema>, NonNullable<BlogSettingsBundle['security']>>
>
