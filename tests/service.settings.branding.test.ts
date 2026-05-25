import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Setting } from '@/server/infra/db/types'

// S3 client + setting repo + snapshot refresh + favicon-pack generation
// are all mocked so the tests stay hermetic. The point is to verify
// `uploadBrandingAsset` / `clearBrandingAsset` orchestration: which
// objects go to S3, what gets written back to the settings row, and
// how a partial-pack failure rolls back the SVG.
vi.mock('@/server/infra/storage/s3-client', () => ({
  putS3Object: vi.fn(),
  deleteS3Object: vi.fn(),
  getS3ObjectBuffer: vi.fn(),
}))
vi.mock('@/server/infra/db/operations/setting', () => ({
  findSettingByScope: vi.fn(),
  upsertSetting: vi.fn(),
}))
vi.mock('@/server/domains/settings/snapshot', () => ({
  refreshBlogSettings: vi.fn(),
}))
vi.mock('@/server/domains/assets/generate', () => ({
  generateFaviconPack: vi.fn(),
}))

const s3 = await import('@/server/infra/storage/s3-client')
const settings = await import('@/server/infra/db/operations/setting')
const { generateFaviconPack } = await import('@/server/domains/assets/generate')
const { uploadBrandingAsset, clearBrandingAsset } = await import('@/server/domains/assets/management')

// PNG magic-byte prefix. Padded to a few extra bytes so size > 0 checks
// pass and the magic-byte sniff returns 'image/png'.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
const ICO_BYTES = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 'utf8')

const baseAssetsRow: Setting = {
  id: 1n,
  scope: 'blog.assets',
  data: {
    asset: { host: 'cdn.example.com', scheme: 'https' },
    storage: {
      enabled: true,
      endpoint: 'https://s3.example.com',
      region: 'auto',
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
      forcePathStyle: false,
      urlTemplate: '',
    },
    upload: { maxBytes: 8 * 1024 * 1024, jpegQuality: 82 },
  },
  updatedAt: new Date(),
  updatedBy: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(settings.findSettingByScope).mockResolvedValue(baseAssetsRow)
  vi.mocked(settings.upsertSetting).mockResolvedValue(baseAssetsRow)
  vi.mocked(generateFaviconPack).mockResolvedValue({
    faviconIco: ICO_BYTES,
    appleTouchIcon: PNG_BYTES,
    icon192: PNG_BYTES,
    icon512: PNG_BYTES,
  })
})

describe('uploadBrandingAsset', () => {
  it('uploads a single binary slot and writes an ObjectRef to the settings row', async () => {
    const ref = await uploadBrandingAsset('appleTouchIcon', PNG_BYTES)

    expect(ref.contentType).toBe('image/png')
    expect(ref.etag).toMatch(/^[a-f0-9]{64}$/)
    expect(ref.size).toBe(PNG_BYTES.length)
    expect(s3.putS3Object).toHaveBeenCalledTimes(1)
    expect(s3.putS3Object).toHaveBeenCalledWith('branding/apple-touch-icon', PNG_BYTES, 'image/png')

    const [data] = vi.mocked(settings.upsertSetting).mock.calls[0]
    const branding = (data as Record<string, unknown>).branding as Record<string, unknown>
    expect(branding.appleTouchIcon).toEqual(ref)
  })

  it('regenerates and uploads the full favicon pack on faviconSvg upload', async () => {
    await uploadBrandingAsset('faviconSvg', SVG_BYTES)

    expect(generateFaviconPack).toHaveBeenCalledTimes(1)
    expect(s3.putS3Object).toHaveBeenCalledTimes(5)
    const keys = vi.mocked(s3.putS3Object).mock.calls.map((c) => c[0])
    expect(keys).toEqual(
      expect.arrayContaining([
        'branding/favicon-svg',
        'branding/favicon-ico',
        'branding/apple-touch-icon',
        'branding/icon-192',
        'branding/icon-512',
      ]),
    )

    const [data] = vi.mocked(settings.upsertSetting).mock.calls[0]
    const branding = (data as Record<string, unknown>).branding as Record<string, unknown>
    expect(branding.faviconSvg).toBeDefined()
    expect(branding.faviconIco).toBeDefined()
    expect(branding.appleTouchIcon).toBeDefined()
    expect(branding.icon192).toBeDefined()
    expect(branding.icon512).toBeDefined()
  })

  it('rolls back S3 puts and skips the settings write when the pack regen fails', async () => {
    vi.mocked(generateFaviconPack).mockRejectedValue(new Error('sharp failed'))

    await expect(uploadBrandingAsset('faviconSvg', SVG_BYTES)).rejects.toThrow('sharp failed')

    // The primary SVG put has already happened — rollback must remove it.
    expect(s3.deleteS3Object).toHaveBeenCalledWith('branding/favicon-svg')
    expect(settings.upsertSetting).not.toHaveBeenCalled()
  })

  it('rejects mismatched content for a binary slot', async () => {
    // PNG bytes in an ICO slot should fail the magic-byte check.
    await expect(uploadBrandingAsset('faviconIco', PNG_BYTES)).rejects.toThrow(/image\/x-icon/)
    expect(s3.putS3Object).not.toHaveBeenCalled()
  })

  it('rejects an SVG that contains a script tag', async () => {
    const hostile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8')
    await expect(uploadBrandingAsset('logoSvg', hostile)).rejects.toThrow(/脚本|事件处理器/)
    expect(s3.putS3Object).not.toHaveBeenCalled()
  })
})

describe('clearBrandingAsset', () => {
  it('clears a single slot and removes the field from the settings row', async () => {
    vi.mocked(settings.findSettingByScope).mockResolvedValue({
      ...baseAssetsRow,
      data: {
        ...(baseAssetsRow.data as Record<string, unknown>),
        branding: { appleTouchIcon: { etag: 'x', contentType: 'image/png', size: 1, updatedAt: '' } },
      },
    } as Setting)

    await clearBrandingAsset('appleTouchIcon')

    expect(s3.deleteS3Object).toHaveBeenCalledTimes(1)
    expect(s3.deleteS3Object).toHaveBeenCalledWith('branding/apple-touch-icon')

    const [data] = vi.mocked(settings.upsertSetting).mock.calls[0]
    const branding = (data as Record<string, unknown>).branding as Record<string, unknown>
    expect(branding.appleTouchIcon).toBeUndefined()
  })

  it('clears favicon pack when faviconSvg is cleared', async () => {
    await clearBrandingAsset('faviconSvg')

    expect(s3.deleteS3Object).toHaveBeenCalledTimes(5)
    const keys = vi.mocked(s3.deleteS3Object).mock.calls.map((c) => c[0])
    expect(keys).toEqual(
      expect.arrayContaining([
        'branding/favicon-svg',
        'branding/favicon-ico',
        'branding/apple-touch-icon',
        'branding/icon-192',
        'branding/icon-512',
      ]),
    )

    const [data] = vi.mocked(settings.upsertSetting).mock.calls[0]
    const branding = (data as Record<string, unknown>).branding as Record<string, unknown>
    expect(branding.faviconSvg).toBeUndefined()
    expect(branding.faviconIco).toBeUndefined()
    expect(branding.appleTouchIcon).toBeUndefined()
    expect(branding.icon192).toBeUndefined()
    expect(branding.icon512).toBeUndefined()
  })
})
