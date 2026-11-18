import type { BundleKey, SettingsSection } from '@kobato/settings/sections.ts'
import type { z } from 'zod'

import { SETTINGS_SECTIONS } from '@kobato/settings/sections.ts'
import { analyticsSection } from '@kobato/settings/sections/analytics.ts'
import { assetsSection } from '@kobato/settings/sections/assets.ts'
import { backupSection } from '@kobato/settings/sections/backup.ts'
import { cacheSection } from '@kobato/settings/sections/cache.ts'
import { commentsSection } from '@kobato/settings/sections/comments.ts'
import { contentSection } from '@kobato/settings/sections/content.ts'
import { fontsSection } from '@kobato/settings/sections/fonts.ts'
import { generalSection } from '@kobato/settings/sections/general.ts'
import { limitsSection } from '@kobato/settings/sections/limits.ts'
import { mailSection } from '@kobato/settings/sections/mail.ts'
import { navigationSection } from '@kobato/settings/sections/navigation.ts'
import { newsletterSection } from '@kobato/settings/sections/newsletter.ts'
import { observabilitySection } from '@kobato/settings/sections/observability.ts'
import { rateLimitSection } from '@kobato/settings/sections/rate-limit.ts'
import { securitySection } from '@kobato/settings/sections/security.ts'
import { seoSection } from '@kobato/settings/sections/seo.ts'
import { sidebarSection } from '@kobato/settings/sections/sidebar.ts'
import { socialsSection } from '@kobato/settings/sections/socials.ts'
import { webmentionsSection } from '@kobato/settings/sections/webmentions.ts'

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
