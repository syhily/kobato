import type { AdminCacheStatsDto } from '@kobato/api/contracts/admin/cache'
import type {
  CacheSettings,
  FontsSettings,
  FooterNavItem,
  NavigationSettings,
  SecuritySettings,
  SocialItem,
} from '@kobato/settings/types'

import { mockTanstackQuery } from '@kobato/test/mock-react-query'
import { CacheView } from '@kobato/web-admin/ui/settings/cache/CacheView'
import { FontsForm } from '@kobato/web-admin/ui/settings/FontsForm'
import { NavigationEditor } from '@kobato/web-admin/ui/settings/navigation/NavigationEditor'
import { SecurityForm } from '@kobato/web-admin/ui/settings/security/SecurityForm'
import { renderInRouter, renderToHtml, stableHtml } from '@kobato/web-kit/tests/utils/render'
import { afterAll, describe, expect, it, vi } from 'vitest'

const cacheQueryMocks = mockTanstackQuery()

cacheQueryMocks.query = {
  data: null as AdminCacheStatsDto | null,
  isPending: false,
  error: null as unknown,
}

cacheQueryMocks.mutation = {
  mutate: vi.fn(),
  isPending: false,
}

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn() }),
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

const apiClientMod = await import('@kobato/api/browser/client')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(
  () =>
    ({
      admin: {
        cache: {
          getStats: vi.fn(async () => ({})),
          clear: vi.fn(async () => ({})),
        },
      },
    }) as never,
)

afterAll(() => {
  vi.restoreAllMocks()
})

const populatedFonts: FontsSettings = {
  og: { family: 'OPPOSans' },
  calendar: { family: 'OPPOSerif' },
  global: [],
  post: [],
  code: [],
}

const emptyFonts: FontsSettings = {
  og: { family: '' },
  calendar: { family: '' },
  global: [],
  post: [],
  code: [],
}

describe('snapshot: FontsForm', () => {
  it('renders the canvas card with populated family names', () => {
    const html = stableHtml(renderInRouter(<FontsForm fonts={populatedFonts} />))
    expect(html).toContain('Canvas 字体')
    expect(html).toContain('OG 图字体')
    expect(html).toContain('日历图字体')
    expect(html).toContain('id="fonts-og-family"')
    expect(html).toContain('id="fonts-calendar-family"')
    expect(html).toContain('上传字体')
    expect(html).toContain('已配置族名：OPPOSans')
    expect(html).toContain('已配置族名：OPPOSerif')
  })

  it('renders the web-font notice card pointing to /admin/library/fonts', () => {
    const html = stableHtml(renderInRouter(<FontsForm fonts={emptyFonts} />))
    expect(html).toContain('网页字体')
    expect(html).toContain('/admin/library/fonts')
    expect(html).toContain('网站字体与槽位分配')
    expect(html).not.toContain('name="globalFamily"')
    expect(html).not.toContain('name="globalCss')
    expect(html).not.toContain('全站字体')
    expect(html).not.toContain('文章页字体')
    expect(html).not.toContain('代码字体')
  })

  it('renders empty-state copy when canvas family is unconfigured', () => {
    const html = stableHtml(renderInRouter(<FontsForm fonts={emptyFonts} />))
    expect(html).toContain('未配置族名')
  })
})

describe('snapshot: SecurityForm', () => {
  it('renders CSRF enabled, CORS disabled and Passkey eligible states', () => {
    const security: SecuritySettings = {
      csrf: { enabled: true, exemptPaths: ['/webhook/github'] },
      cors: { enabled: false, origins: [] },
      passkey: { enabled: false },
    }
    const html = stableHtml(renderToHtml(<SecurityForm security={security} />))
    expect(html).toContain('CSRF 防护')
    expect(html).toContain('id="csrf-enabled"')
    expect(html).toContain('路径豁免')
    expect(html).toContain('name="exemptPaths.0.path"')
    expect(html).toContain('添加路径')
    expect(html).toContain('CORS 策略')
    expect(html).toContain('镜像模式：将自动允许所有请求来源。')
    expect(html).toContain('添加来源')
    expect(html).toContain('Passkey 登录')
    expect(html).toContain('开启后用户可在个人资料中注册 Passkey。')
  })

  it('renders CSRF disabled, CORS enabled with origins, and Passkey enabled states', () => {
    const security: SecuritySettings = {
      csrf: { enabled: false, exemptPaths: [] },
      cors: {
        enabled: true,
        origins: ['https://friend.example.com', 'https://alt.example.com'],
      },
      passkey: { enabled: true },
    }
    const html = stableHtml(renderToHtml(<SecurityForm security={security} />))
    expect(html).toContain('无豁免路径。所有请求均需携带令牌。')
    expect(html).toContain('name="origins.0.url"')
    expect(html).toContain('name="origins.1.url"')
    expect(html).not.toContain('当前站点域名不满足 Passkey 要求')
  })
})

const sideNavItems: NavigationSettings = {
  navigation: {
    sideNav: [
      { text: '首页', link: '/' },
      { text: '关于', link: '/about', target: '_blank' },
    ],
    footerNav: [{ type: 'social', network: 'github' }, { type: 'themeToggle' }, { type: 'search' }],
  },
}

const emptyNav: NavigationSettings = {
  navigation: { sideNav: [], footerNav: [] },
}

const socials: SocialItem[] = [{ name: 'GitHub', network: 'github', type: 'link', link: 'https://github.com/syhly' }]

describe('snapshot: NavigationEditor', () => {
  it('renders side nav and footer nav rows with populated fixtures', () => {
    const html = stableHtml(renderToHtml(<NavigationEditor navigation={sideNavItems} socials={socials} />))
    expect(html).toContain('侧边导航菜单')
    expect(html).toContain('id="nav-text-0"')
    expect(html).toContain('id="nav-text-1"')
    expect(html).toContain('id="nav-link-1"')
    expect(html).toContain('name="sideNavRows.0.text"')
    expect(html).toContain('name="sideNavRows.1.text"')
    expect(html).toContain('添加菜单项')
    expect(html).toContain('底部导航菜单')
    expect(html).toContain('id="footer-item-type-0"')
    expect(html).toContain('id="footer-item-type-2"')
    expect(html).toContain('value="github"')
    expect(html).toContain('添加导航项')
    expect(html).not.toContain('部分社交链接尚未配置')
  })

  it('warns when a footer social references an unconfigured network', () => {
    const nav: NavigationSettings = {
      navigation: {
        sideNav: [],
        footerNav: [{ type: 'social', network: 'wechat' } as FooterNavItem],
      },
    }
    const html = stableHtml(renderToHtml(<NavigationEditor navigation={nav} socials={socials} />))
    expect(html).toContain('部分社交链接尚未配置，保存后不会在页脚显示。')
  })

  it('renders empty-state copy when no nav items exist', () => {
    const html = stableHtml(renderToHtml(<NavigationEditor navigation={emptyNav} socials={socials} />))
    expect(html).toContain('还没有任何菜单条目，点下方按钮新增一项。')
    expect(html).toContain('还没有任何导航条目，点下方按钮新增一项。')
    expect(html).toContain('添加菜单项')
    expect(html).toContain('添加导航项')
  })
})

const baseCacheSlice: CacheSettings['cache'] = {
  og: { prefix: 'og:', ttlSeconds: 604800 },
  calendar: { prefix: 'calendar:', ttlSeconds: 86400 },
  avatar: { prefix: 'avatar:', ttlSeconds: 604800 },
  searchResult: { prefix: 'search:', ttlSeconds: 3600 },
}

function makePopulatedStats(): AdminCacheStatsDto {
  return {
    total: 142,
    generatedAt: '2026-06-17T00:00:00.000Z',
    buckets: [
      {
        id: 'og',
        label: 'OG 图缓存',
        description: '服务端渲染的社交分享图缓存。',
        prefix: 'og:',
        ttlSeconds: 604800,
        pattern: 'og:*',
        keyCount: 42,
        byteSize: 1_572_864,
      },
      {
        id: 'avatar',
        label: '头像缓存',
        description: '远程头像镜像缓存。',
        prefix: 'avatar:',
        ttlSeconds: 604800,
        pattern: 'avatar:*',
        keyCount: 100,
        byteSize: 2_097_152,
      },
    ],
    reserved: [
      {
        id: 'session',
        label: '登录会话',
        description: '已登录用户的服务端会话 blob。',
        keyCount: 13,
      },
    ],
  }
}

describe('snapshot: CacheView', () => {
  it('renders the clear-all card, bucket cards and reserved section when stats resolve', () => {
    cacheQueryMocks.query = {
      data: makePopulatedStats(),
      isPending: false,
      error: null,
    }
    const html = stableHtml(renderToHtml(<CacheView cache={baseCacheSlice} />))
    expect(html).toContain('一键清空')
    expect(html).toContain('当前共 142 条缓存')
    expect(html).toContain('清空全部缓存')
    expect(html).toContain('Session 与限流计数不会受影响')
    expect(html).toContain('OG 图缓存')
    expect(html).toContain('头像缓存')
    expect(html).toContain('受保护的缓存（只读）')
    expect(html).toContain('登录会话')
    expect(html).toContain('磁盘占用')
    expect(html).toContain('当前键数：')
    expect(html).toContain('13')
  })

  it('renders the loading description when stats are still pending', () => {
    cacheQueryMocks.query = { data: null, isPending: true, error: null }
    const html = stableHtml(renderToHtml(<CacheView cache={baseCacheSlice} />))
    expect(html).toContain('正在读取缓存统计…')
    expect(html).toContain('受保护的缓存（只读）')
  })

  it('renders the error description when stats fail to load', () => {
    cacheQueryMocks.query = {
      data: null,
      isPending: false,
      error: new Error('boom'),
    }
    const html = stableHtml(renderToHtml(<CacheView cache={baseCacheSlice} />))
    expect(html).toContain('读取缓存统计失败')
  })

  it('renders an empty (zero-key) cache with the clear-all button disabled', () => {
    cacheQueryMocks.query = {
      data: { ...makePopulatedStats(), total: 0, buckets: [], reserved: [] },
      isPending: false,
      error: null,
    }
    const html = stableHtml(renderToHtml(<CacheView cache={baseCacheSlice} />))
    expect(html).toContain('当前共 0 条缓存')
    expect(html).toContain('disabled=""')
  })
})
