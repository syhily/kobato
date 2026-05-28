export const SETTINGS_SECTIONS = [
  'general',
  'assets',
  'navigation',
  'socials',
  'content',
  'sidebar',
  'comments',
  'seo',
  'mail',
  'cache',
  'rateLimit',
  'search',
  'fonts',
  'cors',
  'backup',
  'limits',
  'analytics',
  'security',
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

export const SECTION_TO_BUNDLE_KEY = {
  general: 'siteIdentity',
  assets: 'assets',
  navigation: 'navigation',
  socials: 'socials',
  content: 'content',
  sidebar: 'sidebar',
  comments: 'comments',
  seo: 'seo',
  mail: 'mail',
  cache: 'cache',
  rateLimit: 'rateLimit',
  search: 'search',
  fonts: 'fonts',
  cors: 'cors',
  backup: 'backup',
  limits: 'limits',
  analytics: 'analytics',
  security: 'security',
} as const satisfies Record<SettingsSection, string>

export type BundleKey = (typeof SECTION_TO_BUNDLE_KEY)[SettingsSection]

/** Stable iteration order for bundle keys (mirrors `SETTINGS_SECTIONS`). */
export const BUNDLE_KEYS = SETTINGS_SECTIONS.map((section) => SECTION_TO_BUNDLE_KEY[section]) as readonly BundleKey[]
