import type { UiMessageId } from '@/shared/i18n/messages/ui/en-US'

// Cache declaration registry: one declaration per bucket, and every derived
// enumeration reads this table, so adding a cache never requires a second
// list. `id` is the stable directory name under `<storage.data>/cache`.
// Labels and key-shape descriptions are UI message ids, not copy — the admin
// surface resolves them (`{prefix}` is the live bucket prefix) — so the
// registry stays locale-free and importable from both bundles.
export interface CacheDeclaration {
  /** Stable discriminator — also the cache directory name. */
  readonly id: string
  readonly labelId: UiMessageId
  /** Key-shape description, interpolated with `{ prefix }` at render time. */
  readonly descriptionId: UiMessageId
  /** Prefix used until an admin renames it (tunable only). */
  readonly defaultPrefix: string
  /** TTL used until an admin tunes it (tunable only). */
  readonly defaultTtlSeconds: number
  /** Whether the bucket owns a prefix + TTL settings slot. */
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
    id: 'imageMeta',
    labelId: 'admin.cache.imageMeta.label',
    descriptionId: 'admin.cache.imageMeta.description',
    defaultPrefix: 'image-meta:',
    defaultTtlSeconds: 60 * 60,
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
  // TTL matches feed/sitemap — a backstop only: content/taxonomy mutations
  // clear these via `invalidateContent`.
  {
    id: 'categories',
    labelId: 'admin.cache.categories.label',
    descriptionId: 'admin.cache.categories.description',
    defaultPrefix: 'categories:',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'tags',
    labelId: 'admin.cache.tags.label',
    descriptionId: 'admin.cache.tags.description',
    defaultPrefix: 'tags:',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'comments',
    labelId: 'admin.cache.comments.label',
    descriptionId: 'admin.cache.comments.description',
    defaultPrefix: 'comments:',
    defaultTtlSeconds: 30,
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

/**
 * Default prefixes of the non-tunable declarations — reserved by the
 * settings schema: renaming a tunable bucket onto one would merge two
 * namespaces under a single prefix.
 */
export const FIXED_CACHE_PREFIXES: readonly string[] = CACHE_DECLARATIONS.filter((entry) => !entry.tunable).map(
  (entry) => entry.defaultPrefix,
)
