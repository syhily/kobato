import type { z } from 'zod'

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
import {
  cacheDefaults,
  commentsDefaults,
  contentDefaults,
  mailDefaults,
  navigationDefaults,
  seoDefaults,
  sidebarDefaults,
  socialsDefaults,
} from '@/server/domains/settings/sections/defaults'
import { DomainError } from '@/server/infra/http/errors'
import { rateLimitDefaults } from '@/shared/config/defaults'
import { SETTINGS_SECTIONS } from '@/shared/config/sections'

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
    defaults: {
      og: { family: 'NotoSansCJK' },
      calendar: { family: 'NotoSansCJK' },
      globalFamily: '',
      postFamily: '',
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
      cors: { enabled: false, origins: [] },
      otp: { enabled: false },
      passkey: { enabled: false },
    },
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
    const check = meta.schema.safeParse(meta.defaults)
    if (!check.success) {
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
