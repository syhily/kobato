export type CacheBucketId = 'og' | 'calendar' | 'avatar' | 'imageMeta' | 'embeddingSearch' | 'searchResult'

export interface CacheBucketSlot {
  prefix: string
  ttlSeconds: number
}

export const CACHE_BUCKET_IDS = [
  'og',
  'calendar',
  'avatar',
  'imageMeta',
  'embeddingSearch',
  'searchResult',
] as const satisfies readonly [CacheBucketId, ...CacheBucketId[]]

export const CACHE_BUCKET_FALLBACKS: Record<CacheBucketId, CacheBucketSlot> = {
  og: { prefix: 'og:', ttlSeconds: 60 * 60 * 24 },
  calendar: { prefix: 'calendar:', ttlSeconds: 60 * 60 * 24 },
  avatar: { prefix: 'avatar:', ttlSeconds: 60 * 60 * 24 },
  imageMeta: { prefix: 'image-meta:', ttlSeconds: 60 * 60 },

  embeddingSearch: { prefix: 'embedding-search:', ttlSeconds: 60 * 60 * 24 * 7 },
  searchResult: { prefix: 'search-result:', ttlSeconds: 60 * 60 },
}

// Read-only cache surfaces that the admin panel surfaces for visibility
// only — no rename, no clear. Both are critical to runtime behaviour:
// `session:*` clearing would log everyone out and break in-flight tokens
// tokens; `rate-limit:*` clearing would let throttled abusers retry
// immediately. The prefixes are baked in to keep these surfaces
// administrative-tool territory (npm shells / Redis CLI).
export type ReservedCacheBucketId = 'session' | 'rateLimit'

export interface ReservedCacheBucket {
  id: ReservedCacheBucketId
  label: string
  description: string
  prefix: string
  pattern: string
}

export const RESERVED_CACHE_BUCKETS: readonly ReservedCacheBucket[] = [
  {
    id: 'session',
    label: '登录会话',
    description:
      'Cookie 解析后命中的 Redis 会话 blob，键形如 session:${sid}。承载所有已登录设备的服务端会话；为防止误清空导致全员登出，仅供查看。',
    prefix: 'session:',
    pattern: 'session:*',
  },
  {
    id: 'rateLimit',
    label: '限流计数器',
    description:
      '登录 / 评论 / 点赞 / 邀请等通道的速率限制窗口计数，键形如 rate-limit:*。清空会让被节流的滥用者立刻可以重试，仅供查看。',
    prefix: 'rate-limit:',
    pattern: 'rate-limit:*',
  },
]

export interface CacheBucket {
  id: CacheBucketId
  label: string
  description: string
  prefix: string
  ttlSeconds: number
  pattern: string
}

export type ClearCacheTarget = CacheBucketId | 'all'

export interface ClearCacheInput {
  target: ClearCacheTarget
}
