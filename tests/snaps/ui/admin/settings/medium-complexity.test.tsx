import { describe, expect, it, vi } from 'vitest'

import type { AssetsLoaderShape } from '@/shared/config/projection'
import type {
  AnalyticsSettings,
  CommentsSettings,
  ContentSettings,
  LimitsSettings,
  MailSettings,
  NavigationSettings,
  RateLimitSettings,
  SearchSettings,
  SecuritySettings,
  SeoSettings,
  SidebarSettings,
  SiteIdentitySettings,
  SocialsSettings,
} from '@/shared/config/types'
import type { MailLoaderShape } from '@/ui/admin/settings/MailForm'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { AnalyticsForm } from '@/ui/admin/settings/AnalyticsForm'
import { AssetsForm } from '@/ui/admin/settings/AssetsForm'
import { CacheView } from '@/ui/admin/settings/CacheView'
import { CommentsForm } from '@/ui/admin/settings/CommentsForm'
import { ContentForm } from '@/ui/admin/settings/ContentForm'
import { GeneralForm } from '@/ui/admin/settings/GeneralForm'
import { LimitsForm } from '@/ui/admin/settings/LimitsForm'
import { MailForm } from '@/ui/admin/settings/MailForm'
import { NavigationEditor } from '@/ui/admin/settings/NavigationEditor'
import { SearchForm } from '@/ui/admin/settings/SearchForm'
import { SecurityForm } from '@/ui/admin/settings/SecurityForm'
import { SeoForm } from '@/ui/admin/settings/SeoForm'
import { SidebarForm } from '@/ui/admin/settings/SidebarForm'
import { SocialsEditor } from '@/ui/admin/settings/SocialsEditor'
import { ThresholdForm } from '@/ui/admin/settings/ThresholdForm'

vi.mock('@/ui/admin/settings/useSettingsMutation', () => ({
  useSettingsMutation: () => ({
    commit: vi.fn(),
    resetStatus: vi.fn(),
    revalidate: vi.fn(),
    isPending: false,
    status: 'idle',
  }),
}))

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn() }),
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query')
  return {
    ...actual,
    useQuery: () => ({ data: null, isPending: false, error: null }),
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const baseSiteIdentity: SiteIdentitySettings = {
  title: '且听书吟',
  description: '诗与梦想的远方',
  website: 'https://example.com',
  keywords: ['雨帆'],
  author: { name: '雨帆', email: 'syhily@gmail.com', url: 'https://example.com' },
  locale: 'zh-CN',
  timeZone: 'Asia/Shanghai',
  timeFormat: 'yyyy-MM-dd',
  initialYear: 2011,
  icpNo: '皖ICP备2021002315号-2',
}

const baseAssets: AssetsLoaderShape = {
  asset: { host: 'assets.example.com', scheme: 'https' },
  storage: {
    enabled: true,
    endpoint: 'https://s3.example.com',
    region: 'auto',
    bucket: 'kobato-test',
    accessKeyId: 'AKIA-TEST',
    forcePathStyle: false,
    urlTemplate: '',
  },
  secretAccessKeyMask: null,
  upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  branding: {
    faviconSvg: { etag: '' },
    faviconIco: { etag: '' },
    appleTouchIcon: { etag: '' },
    icon192: { etag: '' },
    icon512: { etag: '' },
    logoSvg: { etag: '' },
    logoDarkSvg: { etag: '' },
    logoLargeSvg: { etag: '' },
    logoLargeDarkSvg: { etag: '' },
    openGraph: { etag: '' },
    blogPoster: { etag: '' },
    blogPosterDark: { etag: '' },
    defaultAvatar: { etag: '' },
    robotsTxt: '',
  },
}

const baseCache = {
  og: { prefix: 'og:', ttlSeconds: 604800 },
  calendar: { prefix: 'calendar:', ttlSeconds: 86400 },
  avatar: { prefix: 'avatar:', ttlSeconds: 604800 },
  imageMeta: { prefix: 'image-meta:', ttlSeconds: 3600 },
  embeddingSearch: { prefix: 'embedding:', ttlSeconds: 3600 },
  searchResult: { prefix: 'search:', ttlSeconds: 3600 },
}

const baseComments: CommentsSettings = {
  comments: {
    size: 10,
    avatar: { mirror: 'https://gravatar.loli.net/avatar', size: 120 },
    tokenTtlSeconds: 1800,
  },
}

const baseContent: ContentSettings = {
  pagination: { posts: 6, category: 7, tags: 7, search: 7 },
  feed: { full: true, size: 20 },
  post: { sort: 'desc', sortBy: 'publishedAt', featureEnabled: false },
  footnotes: { sectionTitle: '尾声礼记' },
}

const baseLimits: LimitsSettings = {
  maxRequestBodySize: 10 * 1024 * 1024,
  sessionMaxAge: 60 * 60 * 24 * 30,
  auditLogDbRetentionDays: 30,
  auditLogArchiveRetentionDays: 180,
}

const baseSecurityMail: MailSettings['mail'] = {
  enabled: false,
  host: 'api.zeabur.com',
  apiKey: '',
  sender: 'noreply@example.com',
  transport: 'zeabur',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpSecure: false,
  smtpRequireTls: true,
  smtpRejectUnauthorized: true,
  mailgunDomain: '',
  mailgunApiKey: '',
}

const baseMail: MailLoaderShape = {
  mail: {
    enabled: false,
    host: 'api.zeabur.com',
    sender: 'noreply@example.com',
    apiKeyMask: null,
    transport: 'zeabur',
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPassMask: null,
    smtpSecure: false,
    smtpRequireTls: true,
    smtpRejectUnauthorized: true,
    mailgunDomain: '',
    mailgunApiKeyMask: null,
  },
}

const baseNavigation: NavigationSettings = {
  navigation: {
    sideNav: [
      { text: '首页', link: '/' },
      { text: '分类', link: '/categories' },
    ],
    footerNav: [{ type: 'themeToggle' }],
  },
}

const baseSearch: SearchSettings & { apiKeyMask: string | null } = {
  search: {
    enabled: false,
    mode: 'like',
    endpoint: '',
    apiKey: '',
    model: 'text-embedding-3-small',
    similarityThreshold: 0.5,
  },
  apiKeyMask: null,
}

const baseSecurity: SecuritySettings = {
  csrf: { enabled: true, exemptPaths: [] },
  cors: { enabled: false, origins: [] },
  otp: { enabled: false },
  passkey: { enabled: false },
}

const baseSeo: SeoSettings = {
  toc: { minHeadingLevel: 2, maxHeadingLevel: 3 },
  og: { width: 1200, height: 768 },
}

const baseSidebar: SidebarSettings = {
  sidebar: {
    widgets: [
      { type: 'search', enabled: true },
      { type: 'recentPosts', enabled: true, count: 5 },
      { type: 'recentComments', enabled: true, count: 5 },
      { type: 'randomTags', enabled: true, count: 10 },
      { type: 'todayCalendar', enabled: true },
    ],
  },
}

const baseSocials: SocialsSettings = {
  socials: [
    { name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/syhily' },
    {
      name: 'Yufan Sheng',
      network: 'wechat',
      type: 'qrcode',
      title: '扫码加我微信好友',
      link: 'https://u.wechat.com/EBpmuKmrVz4YVFnoCJdnruA',
    },
  ],
}

const baseRateLimit: RateLimitSettings = {
  signInIp: { windowSeconds: 1800, maxAttempts: 5 },
  signInEmail: { windowSeconds: 1800, maxAttempts: 5 },
  otpSendIp: { windowSeconds: 300, maxAttempts: 3 },
  otpSendEmail: { windowSeconds: 300, maxAttempts: 1 },
  otpVerifyIp: { windowSeconds: 300, maxAttempts: 5 },
  otpVerifyEmail: { windowSeconds: 300, maxAttempts: 5 },
  passwordResetIp: { windowSeconds: 1800, maxAttempts: 3 },
  passwordResetEmail: { windowSeconds: 300, maxAttempts: 1 },
  passwordResetTarget: { windowSeconds: 60, maxAttempts: 1 },
  commentPostIp: { windowSeconds: 3600, maxAttempts: 12 },
  commentPostEmail: { windowSeconds: 3600, maxAttempts: 8 },
  likeIncreaseIp: { windowSeconds: 3600, maxAttempts: 30 },
  inviteIp: { windowSeconds: 3600, maxAttempts: 5 },
  inviteEmail: { windowSeconds: 3600, maxAttempts: 1 },
  resourceIp: { windowSeconds: 60, maxAttempts: 60 },
  passkeyAuthBeginIp: { windowSeconds: 300, maxAttempts: 10 },
  passkeyAuthFinishIp: { windowSeconds: 300, maxAttempts: 10 },
  passkeyRegisterBeginIp: { windowSeconds: 300, maxAttempts: 10 },
  passkeyRegisterFinishIp: { windowSeconds: 300, maxAttempts: 10 },
  passkeySetForceIp: { windowSeconds: 300, maxAttempts: 10 },
  passkeyDeleteIp: { windowSeconds: 300, maxAttempts: 10 },
}

const baseAnalytics: AnalyticsSettings = {
  analytics: { trackAdmin: false, keepBotRows: false },
}

describe('snapshot: admin settings forms', () => {
  it('AnalyticsForm renders tracking switches and upload button', () => {
    const html = stableHtml(renderToHtml(<AnalyticsForm analytics={baseAnalytics} />))
    expect(html).toContain('记录管理员访问')
    expect(html).toContain('保留爬虫记录')
    expect(html).toContain('上传 GeoLite2-City.mmdb')
  })

  it('AssetsForm renders domain, S3, upload and robots cards', () => {
    const html = stableHtml(renderToHtml(<AssetsForm assets={baseAssets} />))
    expect(html).toContain('资源域名')
    expect(html).toContain('启用图片上传')
    expect(html).toContain('S3 兼容存储')
    expect(html).toContain('上传参数')
    expect(html).toContain('robots.txt')
    expect(html).toContain('id="assets-asset-host"')
    expect(html).toContain('域名')
  })

  it('CacheView renders clear-all section and reserved buckets heading', () => {
    const html = stableHtml(renderToHtml(<CacheView cache={baseCache} />))
    expect(html).toContain('一键清空')
    expect(html).toContain('受保护的缓存（只读）')
    expect(html).toContain('清空全部缓存')
  })

  it('CommentsForm renders pagination, avatar mirror and token cards', () => {
    const html = stableHtml(renderToHtml(<CommentsForm comments={baseComments} />))
    expect(html).toContain('评论分页')
    expect(html).toContain('头像镜像')
    expect(html).toContain('匿名评论 Token')
    expect(html).toContain('gravatar.loli.net')
  })

  it('ContentForm renders pagination, feed, sort and footnote cards', () => {
    const html = stableHtml(renderToHtml(<ContentForm content={baseContent} />))
    expect(html).toContain('分页')
    expect(html).toContain('RSS / Atom Feed')
    expect(html).toContain('文章排序与置顶')
    expect(html).toContain('脚注汇总标题')
    expect(html).toContain('尾声礼记')
  })

  it('GeneralForm renders identity, footer, author and timezone cards', () => {
    const html = stableHtml(renderToHtml(<GeneralForm siteIdentity={baseSiteIdentity} timeZones={['Asia/Shanghai']} />))
    expect(html).toContain('基本信息')
    expect(html).toContain('页脚信息')
    expect(html).toContain('作者信息')
    expect(html).toContain('时间与本地化')
    expect(html).toContain('id="general-title"')
  })

  it('LimitsForm renders request, session and audit cards', () => {
    const html = stableHtml(renderToHtml(<LimitsForm limits={baseLimits} />))
    expect(html).toContain('请求限制')
    expect(html).toContain('会话限制')
    expect(html).toContain('审计日志限制')
  })

  it('MailForm renders toggle, provider, sender and test cards', () => {
    const html = stableHtml(renderToHtml(<MailForm mail={baseMail} />))
    expect(html).toContain('邮件发送总开关')
    expect(html).toContain('邮件服务提供商')
    expect(html).toContain('发件人邮箱')
    expect(html).toContain('Zeabur ZSend 配置')
    expect(html).toContain('测试发送')
  })

  it('NavigationEditor renders side nav and footer nav cards', () => {
    const html = stableHtml(
      renderToHtml(<NavigationEditor navigation={baseNavigation} socials={baseSocials.socials} />),
    )
    expect(html).toContain('侧边导航菜单')
    expect(html).toContain('底部导航菜单')
    expect(html).toContain('id="nav-text-0"')
    expect(html).toContain('主题切换')
  })

  it('SearchForm renders mode, OpenAI and reindex cards', () => {
    const html = stableHtml(renderToHtml(<SearchForm search={baseSearch} />))
    expect(html).toContain('搜索模式')
    expect(html).toContain('OpenAI 配置')
    expect(html).toContain('索引管理')
  })

  it('SecurityForm renders CSRF, CORS, OTP and passkey cards', () => {
    const html = stableHtml(
      renderToHtml(
        <SecurityForm
          security={baseSecurity}
          mail={baseSecurityMail}
          mailMasks={{ mailApiKeyMask: null, mailSmtpPassMask: null, mailMailgunApiKeyMask: null }}
        />,
      ),
    )
    expect(html).toContain('CSRF 防护')
    expect(html).toContain('路径豁免')
    expect(html).toContain('CORS 策略')
    expect(html).toContain('登录 OTP 验证')
    expect(html).toContain('Passkey 登录')
  })

  it('SeoForm renders TOC and OG size cards', () => {
    const html = stableHtml(renderToHtml(<SeoForm seo={baseSeo} />))
    expect(html).toContain('目录 (TOC)')
    expect(html).toContain('OG 图渲染尺寸')
  })

  it('SidebarForm renders widget list with toggles and counts', () => {
    const html = stableHtml(renderToHtml(<SidebarForm sidebar={baseSidebar} />))
    expect(html).toContain('侧边栏组件')
    expect(html).toContain('搜索框')
    expect(html).toContain('推荐文章')
    expect(html).toContain('最近评论')
    expect(html).toContain('标签云')
    expect(html).toContain('日历组件')
  })

  it('SocialsEditor renders configured networks and link inputs', () => {
    const html = stableHtml(renderToHtml(<SocialsEditor socials={baseSocials} />))
    expect(html).toContain('社交链接')
    expect(html).toContain('GitHub')
    expect(html).toContain('微信')
  })

  it('ThresholdForm renders rate-limit table with grouped buckets', () => {
    const html = stableHtml(renderToHtml(<ThresholdForm rateLimit={baseRateLimit} />))
    expect(html).toContain('流控设置')
    expect(html).toContain('登录限流（按 IP）')
    expect(html).toContain('评论限流（按 IP）')
    expect(html).toContain('公共资源限流（按 IP）')
  })
})
