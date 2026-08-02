import type { SettingsSection } from '@/shared/config/sections'

export type SettingsNavGroup = 'site' | 'content' | 'service' | 'system'

export interface SectionDisplayMeta {
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
    label: '基本信息',
    description: '站点标题、描述、关键词、作者、语言与时区',
    group: 'site',
    icon: 'Settings',
  },
  assets: {
    label: '存储配置',
    description: '资源/CDN 域名、S3 兼容存储、上传参数、品牌素材',
    group: 'site',
    icon: 'HardDrive',
  },
  fonts: {
    label: '字体配置',
    description: 'OG 图与日历图渲染所用的本地 TTF/OTF 字体相对路径',
    group: 'site',
    icon: 'Type',
  },
  content: {
    label: '内容与分页',
    description: '列表分页大小、排序、Feed',
    group: 'content',
    icon: 'FileText',
  },
  sidebar: {
    label: '侧边栏',
    description: '日历、搜索、推荐数量等开关',
    group: 'content',
    icon: 'PanelLeft',
  },
  comments: {
    label: '评论与头像',
    description: '评论分页与 Gravatar 镜像',
    group: 'content',
    icon: 'MessageSquare',
  },
  webmentions: {
    label: 'Webmention',
    description: 'Webmention 接收开关与文章页展示',
    group: 'content',
    icon: 'AtSign',
  },
  seo: {
    label: 'SEO 与目录',
    description: 'TOC 标题级别、OG 尺寸',
    group: 'content',
    icon: 'Search',
  },
  navigation: {
    label: '导航菜单',
    description: '顶部导航条目顺序与链接',
    group: 'content',
    icon: 'Navigation',
  },
  socials: {
    label: '社交链接',
    description: '社交平台账号与二维码',
    group: 'content',
    icon: 'Share2',
  },
  mail: {
    label: '邮件服务',
    description: 'Zeabur ZSend 或 SMTP 配置 / 测试发送',
    group: 'service',
    icon: 'Mail',
  },
  newsletter: {
    label: '邮件订阅',
    description: 'Newsletter 订阅开关、发件人名称与主题前缀',
    group: 'service',
    icon: 'Mails',
  },
  cache: {
    label: '缓存管理',
    description: 'OG 图 / 头像 / 日历的服务端缓存',
    group: 'system',
    icon: 'Database',
  },
  rateLimit: {
    label: '流控设置',
    description: '登录、评论、点赞按 IP / 邮箱的限流策略',
    group: 'system',
    icon: 'Shield',
  },
  limits: {
    label: '运行限制',
    description: '请求体大小限制、会话有效期等运行时阈值',
    group: 'system',
    icon: 'SlidersHorizontal',
  },
  backup: {
    label: '备份与还原',
    description: '数据库自动备份、手动备份与还原',
    group: 'system',
    icon: 'Archive',
  },
  analytics: {
    label: '分析统计',
    description: '访问日志的采集策略与过滤选项',
    group: 'system',
    icon: 'BarChart3',
  },
  security: {
    label: '安全设置',
    description: 'CSRF 防护、路径豁免与 CORS 跨域配置',
    group: 'system',
    icon: 'ShieldCheck',
  },
}
