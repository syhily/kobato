import type { SettingsSection } from '@kobato/settings/sections.ts'
import type { z } from 'zod'

import { SECTION_TO_BUNDLE_KEY } from '@kobato/settings/sections.ts'
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
import { SECTION_REGISTRY } from '@kobato/settings/sections/registry.ts'
import { securitySection } from '@kobato/settings/sections/security.ts'
import { seoSection } from '@kobato/settings/sections/seo.ts'
import { sidebarSection } from '@kobato/settings/sections/sidebar.ts'
import { socialsSection } from '@kobato/settings/sections/socials.ts'
import { webmentionsSection } from '@kobato/settings/sections/webmentions.ts'

export type SiteIdentitySettings = z.infer<typeof generalSection.schema>
export type NavigationSettings = z.infer<typeof navigationSection.schema>
export type SocialsSettings = z.infer<typeof socialsSection.schema>
export type ContentSettings = z.infer<typeof contentSection.schema>
export type SidebarSettings = z.infer<typeof sidebarSection.schema>
export type CommentsSettings = z.infer<typeof commentsSection.schema>
export type WebmentionsSettings = z.infer<typeof webmentionsSection.schema>
export type SeoSettings = z.infer<typeof seoSection.schema>
export type MailSettings = z.infer<typeof mailSection.schema>
export type NewsletterSettings = z.infer<typeof newsletterSection.schema>
export type CacheSettings = z.infer<typeof cacheSection.schema>
export type RateLimitSettings = z.infer<typeof rateLimitSection.schema>
export type FontsSettings = z.infer<typeof fontsSection.schema>
export type AssetsSettings = z.infer<typeof assetsSection.schema>
export type BackupSettings = z.infer<typeof backupSection.schema>
export type LimitsSettings = z.infer<typeof limitsSection.schema>
export type AnalyticsSettings = z.infer<typeof analyticsSection.schema>
export type SecuritySettings = z.infer<typeof securitySection.schema>
export type ObservabilitySettings = z.infer<typeof observabilitySection.schema>

export type NavigationItem = NavigationSettings['navigation']['sideNav'][number]
export type FooterNavItem = NavigationSettings['navigation']['footerNav'][number]
export type FooterNavItemType = FooterNavItem['type']
export type SocialItem = SocialsSettings['socials'][number]
export type SidebarWidget = SidebarSettings['sidebar']['widgets'][number]
export type SidebarWidgetType = SidebarWidget['type']
export type DailyQuoteSource = SidebarSettings['sidebar']['dailyQuote']['source']
export type CustomQuote = SidebarSettings['sidebar']['dailyQuote']['customQuotes'][number]
export type SiteAssetBranding = NonNullable<AssetsSettings['branding']>
export type BrandingObjectRef = NonNullable<SiteAssetBranding['faviconSvg']>
export type StorageDriver = BrandingObjectRef['driver']
export type RateLimitBucket = RateLimitSettings['signIn']

export interface SecretMasks {
  mailSmtpPassMask: string | null
  mailMailgunApiKeyMask: string | null
  assetsSecretAccessKeyMask: string | null
  commentsGithubTokenMask: string | null
  backupEncryptionPasswordMask: string | null
  observabilityPasswordMask: string | null
  observabilityRumClientTokenMask: string | null
}

export type BlogSettingsBundle = {
  [Section in SettingsSection as (typeof SECTION_TO_BUNDLE_KEY)[Section]]: z.infer<
    (typeof SECTION_REGISTRY)[Section]['schema']
  > | null
}

export type SettingsBundle = {
  [K in keyof BlogSettingsBundle]-?: NonNullable<BlogSettingsBundle[K]>
}

type DeepPartial<T> = T extends readonly (infer Item)[]
  ? DeepPartial<Item>[]
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T

export type SettingsSectionPatch<Section extends SettingsSection> = DeepPartial<
  NonNullable<BlogSettingsBundle[(typeof SECTION_TO_BUNDLE_KEY)[Section]]>
>
