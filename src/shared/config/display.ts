// Settings navigation metadata — NEUTRAL registry, no UI copy. Every label and
// description is a UI message id; the settings route resolves them through
// `useI18n()` so the same registry serves all four locales.

import type { SettingsSection } from '@/shared/config/sections'
import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

export type SettingsNavGroup = 'site' | 'content' | 'service' | 'system'

export interface SectionDisplayMeta {
  /** Short label message id rendered as the sidebar item title. */
  labelId: UiMessageId
  /** One-line description message id shown beneath the label. */
  descriptionId: UiMessageId
  group: SettingsNavGroup
  /** Lucide icon name (PascalCase, e.g. 'Settings'). */
  icon: string
}

export const NAV_GROUP_LABEL_KEYS: Record<SettingsNavGroup, UiMessageId> = {
  site: 'admin.settings.nav.group.site',
  content: 'admin.settings.nav.group.content',
  service: 'admin.settings.nav.group.service',
  system: 'admin.settings.nav.group.system',
}

export const SECTION_DISPLAY: Record<SettingsSection, SectionDisplayMeta> = {
  general: {
    labelId: 'admin.settings.section.general.label',
    descriptionId: 'admin.settings.section.general.description',
    group: 'site',
    icon: 'Settings',
  },
  assets: {
    labelId: 'admin.settings.section.assets.label',
    descriptionId: 'admin.settings.section.assets.description',
    group: 'site',
    icon: 'HardDrive',
  },
  fonts: {
    labelId: 'admin.settings.section.fonts.label',
    descriptionId: 'admin.settings.section.fonts.description',
    group: 'site',
    icon: 'Type',
  },
  content: {
    labelId: 'admin.settings.section.content.label',
    descriptionId: 'admin.settings.section.content.description',
    group: 'content',
    icon: 'FileText',
  },
  sidebar: {
    labelId: 'admin.settings.section.sidebar.label',
    descriptionId: 'admin.settings.section.sidebar.description',
    group: 'content',
    icon: 'PanelLeft',
  },
  comments: {
    labelId: 'admin.settings.section.comments.label',
    descriptionId: 'admin.settings.section.comments.description',
    group: 'content',
    icon: 'MessageSquare',
  },
  webmentions: {
    labelId: 'admin.settings.section.webmentions.label',
    descriptionId: 'admin.settings.section.webmentions.description',
    group: 'content',
    icon: 'AtSign',
  },
  seo: {
    labelId: 'admin.settings.section.seo.label',
    descriptionId: 'admin.settings.section.seo.description',
    group: 'content',
    icon: 'Search',
  },
  navigation: {
    labelId: 'admin.settings.section.navigation.label',
    descriptionId: 'admin.settings.section.navigation.description',
    group: 'content',
    icon: 'Navigation',
  },
  socials: {
    labelId: 'admin.settings.section.socials.label',
    descriptionId: 'admin.settings.section.socials.description',
    group: 'content',
    icon: 'Share2',
  },
  mail: {
    labelId: 'admin.settings.section.mail.label',
    descriptionId: 'admin.settings.section.mail.description',
    group: 'service',
    icon: 'Mail',
  },
  newsletter: {
    labelId: 'admin.settings.section.newsletter.label',
    descriptionId: 'admin.settings.section.newsletter.description',
    group: 'service',
    icon: 'Mails',
  },
  cache: {
    labelId: 'admin.settings.section.cache.label',
    descriptionId: 'admin.settings.section.cache.description',
    group: 'system',
    icon: 'Database',
  },
  rateLimit: {
    labelId: 'admin.settings.section.rateLimit.label',
    descriptionId: 'admin.settings.section.rateLimit.description',
    group: 'system',
    icon: 'Shield',
  },
  limits: {
    labelId: 'admin.settings.section.limits.label',
    descriptionId: 'admin.settings.section.limits.description',
    group: 'system',
    icon: 'SlidersHorizontal',
  },
  backup: {
    labelId: 'admin.settings.section.backup.label',
    descriptionId: 'admin.settings.section.backup.description',
    group: 'system',
    icon: 'Archive',
  },
  analytics: {
    labelId: 'admin.settings.section.analytics.label',
    descriptionId: 'admin.settings.section.analytics.description',
    group: 'system',
    icon: 'BarChart3',
  },
  security: {
    labelId: 'admin.settings.section.security.label',
    descriptionId: 'admin.settings.section.security.description',
    group: 'system',
    icon: 'ShieldCheck',
  },
  observability: {
    labelId: 'admin.settings.section.observability.label',
    descriptionId: 'admin.settings.section.observability.description',
    group: 'system',
    icon: 'Activity',
  },
}
