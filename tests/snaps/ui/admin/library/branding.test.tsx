import { describe, expect, it, vi } from 'vitest'

import type { AssetsLoaderShape } from '@/shared/config/projection'

import { renderToHtml, stableHtml } from '#/_helpers/render'
import { BrandingView } from '@/ui/admin/library/BrandingView'

// Route-loader data + revalidator are stubbed so SSR never touches the network.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
    useRouteLoaderData: () => ({ csrfToken: 'test-csrf-token' }),
  }
})

// etag non-empty → "已自定义", empty → "使用默认"; the cast is a documented escape hatch for the partial map.
function buildBranding(overrides: Partial<AssetsLoaderShape['branding']> = {}): AssetsLoaderShape['branding'] {
  const base: AssetsLoaderShape['branding'] = {
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
    defaultMusicCover: { etag: '' },
    robotsTxt: '',
  }
  return { ...base, ...overrides }
}

describe('snapshot: BrandingView', () => {
  it('renders the page header and all four slot groups with uploads reachable', () => {
    const branding = buildBranding({ faviconSvg: { etag: 'sha-abc123' } })
    const html = stableHtml(renderToHtml(<BrandingView branding={branding} />))
    expect(html).toContain('品牌素材')
    expect(html).toContain('集中管理 favicon、Logo、社交卡片与海报等站点品牌素材')
    expect(html).toContain('Favicon 套件')
    expect(html).toContain('站点 Logo')
    expect(html).toContain('社交卡片与海报')
    expect(html).toContain('通用素材')
    expect(html).toContain('已自定义')
    expect(html).toContain('使用默认')
    // Uploads always work (S3 or local fallback) — no storage-disabled state.
    expect(html).toContain('替换')
    expect(html).toContain('上传')
  })

  it('never renders a storage-disabled banner — uploads always succeed via the active backend', () => {
    // Uploads fall back to local storage — no disabled state regardless of config.
    const branding = buildBranding()
    const html = stableHtml(renderToHtml(<BrandingView branding={branding} />))
    expect(html).toContain('品牌素材')
    expect(html).not.toContain('当前未启用 S3 上传')
    expect(html).not.toContain('系统设置 → 资源')
    expect(html).toContain('上传')
  })

  it('renders with no branding configured (all defaults) when branding is null', () => {
    const html = stableHtml(renderToHtml(<BrandingView branding={null} />))
    expect(html).toContain('品牌素材')
    expect(html).toContain('使用默认')
    expect(html).not.toContain('已自定义')
  })
})
