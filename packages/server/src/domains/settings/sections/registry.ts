import type { SettingsSection } from '@kobato/shared/config/sections.ts'
import type { BlogSettingsBundle } from '@kobato/shared/config/types.ts'
import type { Assert, Equals } from '@kobato/shared/contracts/primitives.ts'
import type { z } from 'zod'

import { SECTION_TO_BUNDLE_KEY, SETTINGS_SECTIONS } from '@kobato/shared/config/sections.ts'
import { unsafeCast } from '@kobato/shared/utils/unsafe-cast.ts'

import { DomainError } from '../../../infra/http/errors'
import { analyticsSection } from './analytics'
import { assetsSection } from './assets'
import { backupSection } from './backup'
import { cacheSection } from './cache'
import { commentsSection } from './comments'
import { contentSection } from './content'
import { fontsSection } from './fonts'
import { generalSection } from './general'
import { limitsSection } from './limits'
import { mailSection } from './mail'
import { navigationSection } from './navigation'
import { newsletterSection } from './newsletter'
import { observabilitySection } from './observability'
import { rateLimitSection } from './rate-limit'
import { securitySection } from './security'
import { seoSection } from './seo'
import { sidebarSection } from './sidebar'
import { socialsSection } from './socials'
import { webmentionsSection } from './webmentions'

export interface SectionMeta<
  S extends z.ZodType = z.ZodType,
  K extends keyof BlogSettingsBundle = keyof BlogSettingsBundle,
> {
  scope: string
  schema: S
  /**
   * Stricter schema for the admin WRITE path only; defaults to `schema`. Keep write-only
   * rules out of `schema` itself: hydration shares it, and a stored row the stricter
   * rules reject (e.g. a legacy `http://` storage endpoint) would silently fall back to
   * section defaults on boot.
   */
  writeSchema?: z.ZodType
  key: K
  defaults: Record<string, unknown> | null
}

// One module per section owns its schema, defaults, and metadata; adding a section means
// one module plus one line here. This map is composition only — the parity assert below
// pins every entry to its bundle slot.
export const SECTION_REGISTRY = {
  general: generalSection,
  assets: assetsSection,
  navigation: navigationSection,
  socials: socialsSection,
  content: contentSection,
  sidebar: sidebarSection,
  comments: commentsSection,
  webmentions: webmentionsSection,
  seo: seoSection,
  mail: mailSection,
  newsletter: newsletterSection,
  cache: cacheSection,
  rateLimit: rateLimitSection,
  fonts: fontsSection,
  backup: backupSection,
  limits: limitsSection,
  analytics: analyticsSection,
  security: securitySection,
  observability: observabilitySection,
} as const satisfies Record<SettingsSection, SectionMeta>

/** Common prefix used to fetch every settings row in one SELECT. */
export const SETTINGS_SCOPE_PREFIX = 'blog.'

/** Reverse lookup from a DB `scope` string; `null` when the row belongs to a surface we don't recognise. */
export function sectionFromScope(scope: string): SettingsSection | null {
  for (const section of SETTINGS_SECTIONS) {
    if (SECTION_REGISTRY[section].scope === scope) {
      return section
    }
  }
  return null
}

/**
 * Validate one section's seed `defaults` against its own `schema`. The single defaults
 * validator — hydration backfill and the write path's merge base both go through it.
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

/** Every section with a non-null seed, validated against its own `schema`. */
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

// Compile-time parity over SECTION_REGISTRY × SECTION_TO_BUNDLE_KEY: each entry's `key`
// must equal the shared mapping, and the schema's OUTPUT type must equal the bundle-slot
// DTO (hydration writes `parsed.data` straight into the bundle). Missing entries fail the
// `satisfies` clauses; disagreements fail here.
type _SectionRegistryBundleParity = Assert<
  Equals<
    {
      [S in SettingsSection]: Equals<
        (typeof SECTION_REGISTRY)[S]['key'],
        (typeof SECTION_TO_BUNDLE_KEY)[S]
      > extends true
        ? Equals<
            z.infer<(typeof SECTION_REGISTRY)[S]['schema']>,
            NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[S]]>
          >
        : false
    },
    Record<SettingsSection, true>
  >
>
