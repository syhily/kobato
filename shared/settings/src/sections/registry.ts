import type { BundleKey, SettingsSection } from '@kobato/settings/sections'
import type { z } from 'zod'

import { SETTINGS_SECTIONS } from '@kobato/settings/sections'
import { analyticsSection } from '@kobato/settings/sections/analytics'
import { assetsSection } from '@kobato/settings/sections/assets'
import { backupSection } from '@kobato/settings/sections/backup'
import { cacheSection } from '@kobato/settings/sections/cache'
import { commentsSection } from '@kobato/settings/sections/comments'
import { contentSection } from '@kobato/settings/sections/content'
import { fontsSection } from '@kobato/settings/sections/fonts'
import { generalSection } from '@kobato/settings/sections/general'
import { limitsSection } from '@kobato/settings/sections/limits'
import { mailSection } from '@kobato/settings/sections/mail'
import { navigationSection } from '@kobato/settings/sections/navigation'
import { newsletterSection } from '@kobato/settings/sections/newsletter'
import { observabilitySection } from '@kobato/settings/sections/observability'
import { rateLimitSection } from '@kobato/settings/sections/rate-limit'
import { securitySection } from '@kobato/settings/sections/security'
import { seoSection } from '@kobato/settings/sections/seo'
import { sidebarSection } from '@kobato/settings/sections/sidebar'
import { socialsSection } from '@kobato/settings/sections/socials'
import { webmentionsSection } from '@kobato/settings/sections/webmentions'

export interface SectionMeta<S extends z.ZodType = z.ZodType> {
  scope: string
  schema: S
  writeSchema?: z.ZodType
  key: BundleKey
  defaults: Record<string, unknown> | null
}

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

export const SETTINGS_SCOPE_PREFIX = 'blog.'

export function sectionFromScope(scope: string): SettingsSection | null {
  for (const section of SETTINGS_SECTIONS) {
    if (SECTION_REGISTRY[section].scope === scope) {
      return section
    }
  }
  return null
}
