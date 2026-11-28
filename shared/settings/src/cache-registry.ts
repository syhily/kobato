import type { UiMessageId } from '@kobato/i18n/messages/ui/en-US'

export interface CacheDeclaration {
  readonly id: string
  readonly labelId: UiMessageId
  readonly descriptionId: UiMessageId
  readonly defaultPrefix: string
  readonly defaultTtlSeconds: number
  readonly tunable: boolean
}

export const CACHE_DECLARATIONS = [
  {
    id: 'og',
    labelId: 'admin.cache.og.label',
    descriptionId: 'admin.cache.og.description',
    defaultPrefix: 'og:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'calendar',
    labelId: 'admin.cache.calendar.label',
    descriptionId: 'admin.cache.calendar.description',
    defaultPrefix: 'calendar:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'avatar',
    labelId: 'admin.cache.avatar.label',
    descriptionId: 'admin.cache.avatar.description',
    defaultPrefix: 'avatar:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'searchResult',
    labelId: 'admin.cache.searchResult.label',
    descriptionId: 'admin.cache.searchResult.description',
    defaultPrefix: 'search-result:',
    defaultTtlSeconds: 60 * 60,
    tunable: true,
  },
  {
    id: 'feed',
    labelId: 'admin.cache.feed.label',
    descriptionId: 'admin.cache.feed.description',
    defaultPrefix: 'feed:xml:',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'sitemap',
    labelId: 'admin.cache.sitemap.label',
    descriptionId: 'admin.cache.sitemap.description',
    defaultPrefix: 'sitemap:xml',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'githubRelease',
    labelId: 'admin.cache.githubRelease.label',
    descriptionId: 'admin.cache.githubRelease.description',
    defaultPrefix: 'github-release:',
    defaultTtlSeconds: 15 * 60,
    tunable: false,
  },
  {
    id: 'githubAvatar',
    labelId: 'admin.cache.githubAvatar.label',
    descriptionId: 'admin.cache.githubAvatar.description',
    defaultPrefix: 'github-avatar:',
    defaultTtlSeconds: 15 * 60,
    tunable: false,
  },
] as const satisfies readonly CacheDeclaration[]

export const FIXED_CACHE_PREFIXES: readonly string[] = CACHE_DECLARATIONS.filter((entry) => !entry.tunable).map(
  (entry) => entry.defaultPrefix,
)
