import type { SettingsSection } from '@/shared/config/sections'

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
    description: '资源/CDN 域名、S3 兼容存储、上传参数、品牌素材',
    group: 'site',
    icon: 'HardDrive',
  },
  fonts: {
    to: '/admin/settings',
    label: '字体配置',
    description: 'OG 图与日历图渲染所用的本地 TTF/OTF 字体相对路径',
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
  analytics: {
    to: '/admin/settings',
    label: '分析统计',
    description: '访问日志的采集策略与过滤选项',
    group: 'system',
    icon: 'BarChart3',
  },
  security: {
    to: '/admin/settings',
    label: '安全设置',
    description: 'CSRF 防护与路径豁免',
    group: 'system',
    icon: 'ShieldCheck',
  },
}

/**
 * Stable display order for the admin settings sidebar (mirrors
 * `SETTINGS_SECTIONS`). Consumed by `<SettingsShell>` so adding a
 * section is a one-file change above plus extending `SETTINGS_SECTIONS`.
 */
export const SECTION_DISPLAY_LIST = Object.values(SECTION_DISPLAY)
