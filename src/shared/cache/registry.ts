// Cache declaration registry — the metadata plane of the cache layer.
//
// One declaration per `kv_cache` bucket. Every derived enumeration
// (`CacheBucketId`, `CACHE_BUCKET_IDS`, the contracts `z.enum`,
// `CACHE_BUCKET_FALLBACKS`, the settings defaults and schema slots, the
// admin cache panel) reads from this table, so adding a cache never
// requires editing a second list. The behavior plane (key shapes,
// codecs, `cacheWhen`, counters) lives in `@/server/infra/cache/registry`.
//
// The `id` doubles as the value written into the `kv_cache.bucket`
// column. `tunable` buckets get a settings slot (prefix + TTL editable
// at `/admin/settings/cache`); the rest show read-only in the panel.

export interface CacheDeclaration {
  /** Stable discriminator — also the `kv_cache.bucket` value. */
  readonly id: string
  /** Admin panel copy (Chinese, matching the settings UI). */
  readonly label: string
  /** Key-shape description, interpolated with the live prefix at render time. */
  readonly description: (prefix: string) => string
  /** Prefix used until an admin renames it (tunable) or forever. */
  readonly defaultPrefix: string
  /** TTL used until an admin tunes it (tunable) or forever. */
  readonly defaultTtlSeconds: number
  /** Whether the bucket owns a prefix + TTL settings slot. */
  readonly tunable: boolean
}

export const CACHE_DECLARATIONS = [
  {
    id: 'og',
    label: 'OG 图缓存',
    description: (prefix) =>
      `/images/og/:slug.png 的渲染结果，键形如 ${prefix}<slug>-<hash>。修改 OG 尺寸或文章封面 / 摘要后清理。`,
    defaultPrefix: 'og:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'calendar',
    label: '侧边栏日历缓存',
    description: (prefix) => `/images/calendar/:date.png 的渲染结果，键形如 ${prefix}<yyyy-MM-dd>。一天后会自动失效。`,
    defaultPrefix: 'calendar:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'avatar',
    label: 'Gravatar 头像缓存',
    description: (prefix) =>
      `/images/avatar/:hash.png 缓存的头像字节，键形如 ${prefix}<size>:<hash>（size 为请求 ?s= 参数的尺寸，默认 120）。用户更换头像后清理可让访客立即看到新头像。`,
    defaultPrefix: 'avatar:',
    defaultTtlSeconds: 60 * 60 * 24,
    tunable: true,
  },
  {
    id: 'imageMeta',
    label: '图片元数据缓存',
    description: (prefix) =>
      `SSR 渲染时 storagePath → image 行的查询结果（宽 / 高 / thumbhash），键形如 ${prefix}<storagePath>。在图片库批量上传或导入旧站数据后清理一次即可。`,
    defaultPrefix: 'image-meta:',
    defaultTtlSeconds: 60 * 60,
    tunable: true,
  },
  {
    id: 'searchResult',
    label: '搜索结果缓存',
    description: (prefix) =>
      `搜索查询返回的文章 slug 列表，键形如 ${prefix}<generation>:<sha256(query)>。分页时直接命中缓存，避免重复查询数据库。`,
    defaultPrefix: 'search-result:',
    defaultTtlSeconds: 60 * 60,
    tunable: true,
  },
  {
    id: 'feed',
    label: 'Feed 缓存',
    description: (prefix) =>
      `/feed 系列端点的 RSS / Atom XML，键形如 ${prefix}all、${prefix}cat:<slug>、${prefix}tag:<slug>。发布或删除文章后自动清空。`,
    defaultPrefix: 'feed:xml:',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'sitemap',
    label: '站点地图缓存',
    description: (prefix) => `/sitemap.xml 的生成结果，缓存键为 ${prefix}。发布或删除文章 / 页面后自动清空。`,
    defaultPrefix: 'sitemap:xml',
    defaultTtlSeconds: 300,
    tunable: false,
  },
  {
    id: 'categories',
    label: '分类列表缓存',
    description: (prefix) => `公开侧全部分类（含文章计数）的查询结果，键形如 ${prefix}all。分类或文章变更后自动清空。`,
    defaultPrefix: 'categories:',
    defaultTtlSeconds: 30,
    tunable: false,
  },
  {
    id: 'tags',
    label: '标签列表缓存',
    description: (prefix) => `公开侧全部标签（含文章计数）的查询结果，键形如 ${prefix}all。标签或文章变更后自动清空。`,
    defaultPrefix: 'tags:',
    defaultTtlSeconds: 30,
    tunable: false,
  },
  {
    id: 'comments',
    label: '最新评论缓存',
    description: (prefix) => `侧边栏「最新评论」列表的查询结果，键形如 ${prefix}latest。评论增删或审核后自动清空。`,
    defaultPrefix: 'comments:',
    defaultTtlSeconds: 30,
    tunable: false,
  },
  {
    id: 'githubRelease',
    label: 'GitHub 版本缓存',
    description: (prefix) =>
      `GitHub Releases API 的查询结果，键形如 ${prefix}<owner>/<repo>/<endpoint>。短 TTL 仅用于削减重复外呼，到期后自动重新请求。`,
    defaultPrefix: 'github-release:',
    defaultTtlSeconds: 15 * 60,
    tunable: false,
  },
  {
    id: 'githubAvatar',
    label: 'GitHub 头像缓存',
    description: (prefix) =>
      `站长 GitHub 头像的 data URL，缓存键为 ${prefix}。短 TTL 仅用于削减重复外呼（每次新会话的 30s 直连超时），到期后自动重新请求。`,
    defaultPrefix: 'github-avatar:',
    defaultTtlSeconds: 15 * 60,
    tunable: false,
  },
] as const satisfies readonly CacheDeclaration[]

/**
 * Default prefixes of the non-tunable declarations. The settings schema
 * treats them as reserved: a tunable bucket renamed onto one would merge
 * two namespaces under one prefix and let a prefix scan reach across
 * buckets.
 */
export const FIXED_CACHE_PREFIXES: readonly string[] = CACHE_DECLARATIONS.filter((entry) => !entry.tunable).map(
  (entry) => entry.defaultPrefix,
)
