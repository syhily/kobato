import { describe, expect, it, vi } from 'vitest'

import type { AssetsLoaderShape } from '@/shared/config/projection'

import { mockTanstackQuery } from '#/_helpers/mock-react-query'
import { renderToHtml, stableHtml } from '#/_helpers/render'
import { StorageView } from '@/ui/admin/library/StorageView'

mockTanstackQuery()

// The migration card revalidates the route loader on completion — stub it for SSR.
vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router')
  return {
    ...actual,
    useRevalidator: () => ({ revalidate: vi.fn(), state: 'idle' }),
  }
})

function buildAssets(overrides: Partial<AssetsLoaderShape['storage']> = {}): AssetsLoaderShape {
  return {
    asset: { host: 'assets.example.com', scheme: 'https' },
    storage: {
      enabled: false,
      endpoint: '',
      region: '',
      bucket: '',
      accessKeyId: '',
      forcePathStyle: false,
      urlTemplate: '',
      ...overrides,
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
      defaultMusicCover: { etag: '' },
      robotsTxt: '',
    },
  }
}

describe('snapshot: StorageView', () => {
  it('renders status, domain and editable S3 cards when S3 is not configured', () => {
    const html = stableHtml(renderToHtml(<StorageView assets={buildAssets()} />))
    expect(html).toContain('存储管理')
    expect(html).toContain('当前存储')
    expect(html).toContain('本地文件系统')
    expect(html).toContain('迁移存储…')
    expect(html).toContain('资源域名')
    expect(html).toContain('S3 兼容存储')
    expect(html).toContain('连通性验证')
    expect(html).not.toContain('S3 配置已锁定')
  })

  it('locks the structural S3 fields once enabled but keeps credentials editable', () => {
    const html = stableHtml(
      renderToHtml(
        <StorageView
          assets={buildAssets({
            enabled: true,
            endpoint: 'https://s3.example.com',
            region: 'auto',
            bucket: 'kobato-test',
            accessKeyId: 'AKIA-TEST',
          })}
        />,
      ),
    )
    expect(html).toContain('S3 配置已锁定')
    expect(html).toContain('kobato-test')
    // Structural fields are disabled individually (no more blanket fieldset)…
    expect(html).not.toContain('fieldset disabled')
    const inputById = (id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ''
    // The `disabled` ATTRIBUTE (the class list always carries `disabled:` variants).
    expect(inputById('assets-endpoint')).toContain('disabled=""')
    // …while credentials and the URL template stay editable.
    expect(inputById('assets-access-key-id')).not.toContain('disabled=""')
    expect(inputById('assets-url-template')).not.toContain('disabled=""')
  })

  it('renders a placeholder when settings are not initialized', () => {
    const html = stableHtml(renderToHtml(<StorageView assets={null} />))
    expect(html).toContain('站点设置尚未初始化')
    expect(html).not.toContain('id="assets-asset-host"')
  })
})
