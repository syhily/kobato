// Conservative rate-limit defaults used by the install seed, the
// settings backfill, and the infra rate-limit fallback path. Kept in
// shared so `infra/rate-limit.ts` can read them without crossing into
// `domains/`.
export const rateLimitDefaults = {
  signInIp: { windowSeconds: 60 * 30, maxAttempts: 5 },
  commentPostIp: { windowSeconds: 60 * 60, maxAttempts: 12 },
  commentPostEmail: { windowSeconds: 60 * 60, maxAttempts: 8 },
  likeIncreaseIp: { windowSeconds: 60 * 60, maxAttempts: 30 },
  inviteIp: { windowSeconds: 60 * 60, maxAttempts: 5 },
  inviteEmail: { windowSeconds: 60 * 60, maxAttempts: 1 },
  passwordResetIp: { windowSeconds: 60 * 30, maxAttempts: 3 },
  passwordResetEmail: { windowSeconds: 60 * 5, maxAttempts: 1 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  resourceIp: { windowSeconds: 60, maxAttempts: 60 },
} as const

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
] as const

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]

// Section → `BlogSettingsBundle` field mapping. Lives here (and not in
// `@/server/domains/settings/sections.ts`) because every layer of the app
// reaches for it: the server registry uses it to type its `key`
// field, the snapshot builder uses it to project rows into the
// in-memory bundle, and the React contexts file uses it to mint one
// context per bundle slot. Centralising the map deletes three sibling
// "list of 12 keys" copies that used to drift on every section
// addition.
//
// `general` → `siteIdentity` is the only non-identity mapping
// (historical: `blog.general` was renamed before the install seed
// rolled out, but the bundle field kept its old "site identity" name
// so existing UI hooks didn't have to rotate).
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
} as const satisfies Record<SettingsSection, string>

export type BundleKey = (typeof SECTION_TO_BUNDLE_KEY)[SettingsSection]

/** Stable iteration order for bundle keys (mirrors `SETTINGS_SECTIONS`). */
export const BUNDLE_KEYS = SETTINGS_SECTIONS.map((section) => SECTION_TO_BUNDLE_KEY[section]) as readonly BundleKey[]

// Display metadata for each settings section. The strings are
// rendered in the admin `<SettingsShell>` sidebar and the mobile
// drawer; centralising them here means adding a thirteenth section
// is a one-file edit (extend `SETTINGS_SECTIONS` and add the matching
// label/description) instead of "remember to also touch the sidebar
// component".
//
// Lives in `@/shared/` because the strings are pure data — no
// server- or DOM-only dependencies — and the UI layer must not
// reach into `@/server/` to pull them in.
export type SettingsNavGroup = 'site' | 'content' | 'service' | 'system'

export interface SectionDisplayMeta {
  /** URL the sidebar `NavLink` points at. */
  to: string
  /** Short Chinese label rendered as the sidebar item title. */
  label: string
  /** One-line Chinese description shown beneath the label. */
  description: string
  /** Navigation group key. */
  group: SettingsNavGroup
  /** Lucide icon name (PascalCase, e.g. 'Settings'). */
  icon: string
}

export const NAV_GROUP_LABEL: Record<SettingsNavGroup, string> = {
  site: '站点',
  content: '内容与展示',
  service: '服务集成',
  system: '系统运维',
}

export const SECTION_DISPLAY: Record<SettingsSection, SectionDisplayMeta> = {
  general: {
    to: '/admin/settings',
    label: '基本信息',
    description: '站点标题、描述、关键词、作者、语言与时区',
    group: 'site',
    icon: 'Settings',
  },
  assets: {
    to: '/admin/settings',
    label: '存储配置',
    description: '资源/CDN 域名、S3 兼容存储、上传参数',
    group: 'site',
    icon: 'HardDrive',
  },
  fonts: {
    to: '/admin/settings',
    label: '字体配置',
    description: 'OG 图与日历图渲染所用的远程 TTF 字体地址',
    group: 'site',
    icon: 'Type',
  },
  cors: {
    to: '/admin/settings',
    label: 'CORS 配置',
    description: '跨域资源共享，允许的来源域名列表',
    group: 'system',
    icon: 'Globe',
  },
  content: {
    to: '/admin/settings',
    label: '内容与分页',
    description: '列表分页大小、排序、Feed',
    group: 'content',
    icon: 'FileText',
  },
  sidebar: {
    to: '/admin/settings',
    label: '侧边栏',
    description: '日历、搜索、推荐数量等开关',
    group: 'content',
    icon: 'PanelLeft',
  },
  comments: {
    to: '/admin/settings',
    label: '评论与头像',
    description: '评论分页与 Gravatar 镜像',
    group: 'content',
    icon: 'MessageSquare',
  },
  seo: {
    to: '/admin/settings',
    label: 'SEO 与目录',
    description: 'TOC 标题级别、OG 尺寸',
    group: 'content',
    icon: 'Search',
  },
  navigation: {
    to: '/admin/settings',
    label: '导航菜单',
    description: '顶部导航条目顺序与链接',
    group: 'content',
    icon: 'Navigation',
  },
  socials: {
    to: '/admin/settings',
    label: '社交链接',
    description: '社交平台账号与二维码',
    group: 'content',
    icon: 'Share2',
  },
  mail: {
    to: '/admin/settings',
    label: '邮件服务',
    description: 'Zeabur ZSend 配置 / 测试发送',
    group: 'service',
    icon: 'Mail',
  },
  search: {
    to: '/admin/settings',
    label: '文章搜索',
    description: 'AI 向量搜索与关键词搜索切换、OpenAI 配置',
    group: 'service',
    icon: 'SearchCode',
  },
  cache: {
    to: '/admin/settings',
    label: '缓存管理',
    description: 'OG 图 / 头像 / 日历的 Redis 缓存',
    group: 'system',
    icon: 'Database',
  },
  rateLimit: {
    to: '/admin/settings',
    label: '流控设置',
    description: '登录、评论、点赞按 IP / 邮箱的限流策略',
    group: 'system',
    icon: 'Shield',
  },
  limits: {
    to: '/admin/settings',
    label: '运行限制',
    description: '请求体大小限制、会话有效期等运行时阈值',
    group: 'system',
    icon: 'SlidersHorizontal',
  },
  backup: {
    to: '/admin/settings',
    label: '备份与还原',
    description: '数据库自动备份、手动备份与还原',
    group: 'system',
    icon: 'Archive',
  },
}

/**
 * Stable display order for the admin settings sidebar (mirrors
 * `SETTINGS_SECTIONS`). Consumed by `<SettingsShell>` so adding a
 * section is a one-file change above plus extending `SETTINGS_SECTIONS`.
 */
export const SECTION_DISPLAY_LIST = SETTINGS_SECTIONS.map((section) => SECTION_DISPLAY[section])

export interface UpdateSettingsInput {
  section: SettingsSection
  payload: unknown
}

// DTO shapes the server projection emits and the admin forms consume. They
// live in shared (not in the admin form modules) so the server projection
// can import them without crossing the server to UI boundary.

export interface AssetsLoaderShape {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled: boolean
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    forcePathStyle: boolean
    urlTemplate: string
  }
  /** Last 4 chars of the stored secret access key, or `null` when unset. */
  secretAccessKeyMask: string | null
  upload: { maxBytes: number; jpegQuality: number }
}

export interface SearchLoaderShape {
  search: {
    enabled: boolean
    mode: 'vector' | 'like'
    endpoint: string
    apiKey: string
    model: string
    similarityThreshold: number
  }
  apiKeyMask: string | null
}

export interface UpdateSettingsOutput {
  success: true
}

export interface SendTestMailInput {
  to: string
}

export interface SendTestMailOutput {
  success: true
}

/**
 * Project the raw `AssetsSettings` (from the settings bundle) into the
 * shape `<AssetsForm>` expects, with secret masking and defaulted upload
 * limits. Kept in shared so route components can call it without
 * reaching into `server/`.
 */
export function projectAssetsForAdmin(assets: {
  asset: { host: string; scheme: 'http' | 'https' }
  storage: {
    enabled?: boolean
    endpoint?: string
    region?: string
    bucket?: string
    accessKeyId?: string
    secretAccessKey?: string
    forcePathStyle?: boolean
    urlTemplate?: string
  }
  upload: { maxBytes?: number; jpegQuality?: number }
}): AssetsLoaderShape {
  const secretAccessKey = typeof assets.storage.secretAccessKey === 'string' ? assets.storage.secretAccessKey : ''
  return {
    asset: { host: assets.asset.host, scheme: assets.asset.scheme },
    storage: {
      enabled: assets.storage.enabled === true,
      endpoint: assets.storage.endpoint ?? '',
      region: assets.storage.region ?? '',
      bucket: assets.storage.bucket ?? '',
      accessKeyId: assets.storage.accessKeyId ?? '',
      forcePathStyle: assets.storage.forcePathStyle === true,
      urlTemplate: assets.storage.urlTemplate ?? '',
    },
    secretAccessKeyMask: secretAccessKey === '' ? null : secretAccessKey.slice(-4),
    upload: {
      maxBytes: assets.upload.maxBytes ?? 8 * 1024 * 1024,
      jpegQuality: assets.upload.jpegQuality ?? 82,
    },
  }
}

/**
 * Project the raw `SearchSettings` (from the settings bundle) into the
 * shape `<SearchForm>` expects, with API key masking.
 */
export function projectSearchForAdmin(
  search:
    | {
        search: {
          enabled?: boolean
          mode?: 'vector' | 'like'
          endpoint?: string
          apiKey?: string
          model?: string
          similarityThreshold?: number
        }
      }
    | undefined,
): SearchLoaderShape {
  const s = search ?? {
    search: {
      enabled: false,
      mode: 'like' as const,
      endpoint: '',
      apiKey: '',
      model: 'text-embedding-3-small',
      similarityThreshold: 0.5,
    },
  }
  const apiKey = typeof s.search.apiKey === 'string' ? s.search.apiKey : ''
  return {
    search: {
      enabled: s.search.enabled === true,
      mode: s.search.mode === 'vector' ? 'vector' : 'like',
      endpoint: s.search.endpoint ?? '',
      apiKey,
      model: s.search.model ?? 'text-embedding-3-small',
      similarityThreshold: s.search.similarityThreshold ?? 0.5,
    },
    apiKeyMask: apiKey === '' ? null : apiKey.slice(-4),
  }
}
