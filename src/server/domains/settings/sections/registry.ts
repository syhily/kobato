import type { z } from 'zod'

import type { SettingsSection } from '@/shared/config/sections'
import type { BlogSettingsBundle } from '@/shared/config/types'
import type { Assert, Equals } from '@/shared/contracts/primitives'

import { analyticsSection } from '@/server/domains/settings/sections/analytics'
import { assetsSection } from '@/server/domains/settings/sections/assets'
import { backupSection } from '@/server/domains/settings/sections/backup'
import { cacheSection } from '@/server/domains/settings/sections/cache'
import { commentsSection } from '@/server/domains/settings/sections/comments'
import { contentSection } from '@/server/domains/settings/sections/content'
import { fontsSection } from '@/server/domains/settings/sections/fonts'
import { generalSection } from '@/server/domains/settings/sections/general'
import { limitsSection } from '@/server/domains/settings/sections/limits'
import { mailSection } from '@/server/domains/settings/sections/mail'
import { navigationSection } from '@/server/domains/settings/sections/navigation'
import { newsletterSection } from '@/server/domains/settings/sections/newsletter'
import { rateLimitSection } from '@/server/domains/settings/sections/rate-limit'
import { searchSection } from '@/server/domains/settings/sections/search'
import { securitySection } from '@/server/domains/settings/sections/security'
import { seoSection } from '@/server/domains/settings/sections/seo'
import { sidebarSection } from '@/server/domains/settings/sections/sidebar'
import { socialsSection } from '@/server/domains/settings/sections/socials'
import { DomainError } from '@/server/infra/http/errors'
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

// One module per section (`sections/<section>.ts`) owns that section's
// Zod schema, seed defaults, and registry metadata (scope + bundle key)
// — adding a section means adding ONE module plus ONE line here, never
// a second enumeration. This map is composition only; the schema↔DTO
// parity asserts at the bottom pin every entry to its bundle slot.
export const SECTION_REGISTRY = {
  general: generalSection,
  assets: assetsSection,
  navigation: navigationSection,
  socials: socialsSection,
  content: contentSection,
  sidebar: sidebarSection,
  comments: commentsSection,
  seo: seoSection,
  mail: mailSection,
  newsletter: newsletterSection,
  cache: cacheSection,
  rateLimit: rateLimitSection,
  search: searchSection,
  fonts: fontsSection,
  backup: backupSection,
  limits: limitsSection,
  analytics: analyticsSection,
  security: securitySection,
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
  Equals<z.infer<typeof generalSection.schema>, NonNullable<BlogSettingsBundle['siteIdentity']>>
>
type _assetsSchemaDtoParity = Assert<
  Equals<z.infer<typeof assetsSection.schema>, NonNullable<BlogSettingsBundle['assets']>>
>
type _navigationSchemaDtoParity = Assert<
  Equals<z.infer<typeof navigationSection.schema>, NonNullable<BlogSettingsBundle['navigation']>>
>
type _socialsSchemaDtoParity = Assert<
  Equals<z.infer<typeof socialsSection.schema>, NonNullable<BlogSettingsBundle['socials']>>
>
type _contentSchemaDtoParity = Assert<
  Equals<z.infer<typeof contentSection.schema>, NonNullable<BlogSettingsBundle['content']>>
>
type _sidebarSchemaDtoParity = Assert<
  Equals<z.infer<typeof sidebarSection.schema>, NonNullable<BlogSettingsBundle['sidebar']>>
>
type _commentsSchemaDtoParity = Assert<
  Equals<z.infer<typeof commentsSection.schema>, NonNullable<BlogSettingsBundle['comments']>>
>
type _seoSchemaDtoParity = Assert<Equals<z.infer<typeof seoSection.schema>, NonNullable<BlogSettingsBundle['seo']>>>
type _mailSchemaDtoParity = Assert<Equals<z.infer<typeof mailSection.schema>, NonNullable<BlogSettingsBundle['mail']>>>
type _newsletterSchemaDtoParity = Assert<
  Equals<z.infer<typeof newsletterSection.schema>, NonNullable<BlogSettingsBundle['newsletter']>>
>
type _cacheSchemaDtoParity = Assert<
  Equals<z.infer<typeof cacheSection.schema>, NonNullable<BlogSettingsBundle['cache']>>
>
type _rateLimitSchemaDtoParity = Assert<
  Equals<z.infer<typeof rateLimitSection.schema>, NonNullable<BlogSettingsBundle['rateLimit']>>
>
type _searchSchemaDtoParity = Assert<
  Equals<z.infer<typeof searchSection.schema>, NonNullable<BlogSettingsBundle['search']>>
>
type _fontsSchemaDtoParity = Assert<
  Equals<z.infer<typeof fontsSection.schema>, NonNullable<BlogSettingsBundle['fonts']>>
>
type _backupSchemaDtoParity = Assert<
  Equals<z.infer<typeof backupSection.schema>, NonNullable<BlogSettingsBundle['backup']>>
>
type _limitsSchemaDtoParity = Assert<
  Equals<z.infer<typeof limitsSection.schema>, NonNullable<BlogSettingsBundle['limits']>>
>
type _analyticsSchemaDtoParity = Assert<
  Equals<z.infer<typeof analyticsSection.schema>, NonNullable<BlogSettingsBundle['analytics']>>
>
type _securitySchemaDtoParity = Assert<
  Equals<z.infer<typeof securitySection.schema>, NonNullable<BlogSettingsBundle['security']>>
>
