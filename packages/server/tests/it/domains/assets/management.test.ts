import type { BrandingObjectRef } from '@kobato/shared/config/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
import { makeMemoryBackend } from '#/_helpers/memory-storage'

// uploadBrandingAsset / clearBrandingAsset orchestration against the REAL
// settings table: objects go to the shared in-memory storage backend (a
// true external — S3/local disk, injected through the registry seam as the
// active 's3' backend), the favicon-pack generator stays mocked (sharp),
// and every settings write is asserted by reading the row back from SQLite.
import { SECTION_REGISTRY } from '@kobato/server/domains/settings/sections/registry'
import { findSettingByScope, upsertSetting } from '@kobato/server/infra/db/operations/setting'
import { __resetStorageBackendsForTests, __setStorageBackendForTests } from '@kobato/server/infra/storage/registry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mem = makeMemoryBackend()

const generateFaviconPackMock = vi.hoisted(() => vi.fn())
vi.mock('@kobato/server/domains/assets/generate', () => ({
  generateFaviconPack: generateFaviconPackMock,
}))

const { uploadBrandingAsset, clearBrandingAsset } = await import('@kobato/server/domains/assets/management')

const db = getTestDb()

// PNG magic-byte prefix. Padded to a few extra bytes so size > 0 checks
// pass and the magic-byte sniff returns 'image/png'.
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00])
const ICO_BYTES = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00])
const SVG_BYTES = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>', 'utf8')

const ASSETS_SCOPE = SECTION_REGISTRY.assets.scope

const baseAssetsData: Record<string, unknown> = {
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
}

function seedAssetsRow(branding?: Record<string, unknown>): void {
  upsertSetting(db, branding === undefined ? baseAssetsData : { ...baseAssetsData, branding }, null, ASSETS_SCOPE)
}

function readBranding(): Record<string, unknown> {
  const row = findSettingByScope(db, ASSETS_SCOPE)
  expect(row).not.toBeNull()
  return ((row!.data as Record<string, unknown>).branding ?? {}) as Record<string, unknown>
}

beforeEach(async () => {
  __setStorageBackendForTests('s3', mem.backend)
  await clearAllTables(db)
  vi.clearAllMocks()
  generateFaviconPackMock.mockResolvedValue({
    faviconIco: ICO_BYTES,
    appleTouchIcon: PNG_BYTES,
    icon192: PNG_BYTES,
    icon512: PNG_BYTES,
  })
  seedAssetsRow()
})

afterEach(() => {
  __resetStorageBackendsForTests()
  mem.reset()
})

describe('uploadBrandingAsset', () => {
  it('uploads a single binary slot and writes an ObjectRef to the settings row', async () => {
    const ref = await uploadBrandingAsset(db, 'appleTouchIcon', PNG_BYTES)

    expect(ref.contentType).toBe('image/png')
    expect(ref.etag).toMatch(/^[a-f0-9]{64}$/)
    expect(ref.size).toBe(PNG_BYTES.length)
    expect(ref.driver).toBe('s3')

    const stored = mem.store.get('branding/apple-touch-icon.png')
    expect(stored).toBeDefined()
    expect(stored!.body.equals(PNG_BYTES)).toBe(true)
    expect(stored!.contentType).toBe('image/png')

    expect(readBranding().appleTouchIcon).toEqual(ref)
  })

  it('regenerates and uploads the full favicon pack on faviconSvg upload', async () => {
    await uploadBrandingAsset(db, 'faviconSvg', SVG_BYTES)

    expect(generateFaviconPackMock).toHaveBeenCalledTimes(1)
    expect([...mem.store.keys()].sort()).toEqual(
      [
        'branding/favicon.svg',
        'branding/favicon.ico',
        'branding/apple-touch-icon.png',
        'branding/icon-192.png',
        'branding/icon-512.png',
      ].sort(),
    )

    const branding = readBranding()
    for (const slot of ['faviconSvg', 'faviconIco', 'appleTouchIcon', 'icon192', 'icon512']) {
      expect(branding[slot]).toBeDefined()
      expect((branding[slot] as BrandingObjectRef).driver).toBe('s3')
    }
  })

  it('rolls back backend puts and skips the settings write when the pack regen fails', async () => {
    generateFaviconPackMock.mockRejectedValue(new Error('sharp failed'))

    await expect(uploadBrandingAsset(db, 'faviconSvg', SVG_BYTES)).rejects.toThrow('sharp failed')

    // The primary SVG put has already happened — rollback must remove it.
    expect(mem.deletedKeys).toContain('branding/favicon.svg')
    expect(mem.store.has('branding/favicon.svg')).toBe(false)
    // No settings write: the row carries no branding section at all.
    expect(readBranding()).toEqual({})
  })

  it('rejects mismatched content for a binary slot', async () => {
    // PNG bytes in an ICO slot should fail the magic-byte check.
    await expect(uploadBrandingAsset(db, 'faviconIco', PNG_BYTES)).rejects.toThrow(/image\/x-icon/)
    expect(mem.store.size).toBe(0)
  })

  it('rejects an SVG that contains a script tag', async () => {
    const hostile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8')
    await expect(uploadBrandingAsset(db, 'logoSvg', hostile)).rejects.toThrow(/脚本|事件处理器/)
    expect(mem.store.size).toBe(0)
  })
})

describe('clearBrandingAsset', () => {
  it('clears a single slot and removes the field from the settings row', async () => {
    seedAssetsRow({ appleTouchIcon: { etag: 'x', contentType: 'image/png', size: 1, updatedAt: '', driver: 's3' } })
    mem.reset() // drop the legacy-key deletes recorded during seeding — none happen, but keep counts honest

    await clearBrandingAsset(db, 'appleTouchIcon')

    // Deletes both the current key and the legacy (extensionless) key.
    expect(mem.deletedKeys).toHaveLength(2)
    expect(mem.deletedKeys).toContain('branding/apple-touch-icon.png')
    expect(mem.deletedKeys).toContain('branding/apple-touch-icon')

    expect(readBranding().appleTouchIcon).toBeUndefined()
  })

  it('clears favicon pack when faviconSvg is cleared', async () => {
    await clearBrandingAsset(db, 'faviconSvg')

    // 5 slots × 2 keys (current + legacy) = 10 deletes
    expect(mem.deletedKeys).toHaveLength(10)
    expect(mem.deletedKeys).toEqual(
      expect.arrayContaining([
        'branding/favicon.svg',
        'branding/favicon-svg',
        'branding/favicon.ico',
        'branding/favicon-ico',
        'branding/apple-touch-icon.png',
        'branding/apple-touch-icon',
        'branding/icon-192.png',
        'branding/icon-192',
        'branding/icon-512.png',
        'branding/icon-512',
      ]),
    )

    const branding = readBranding()
    expect(branding.faviconSvg).toBeUndefined()
    expect(branding.faviconIco).toBeUndefined()
    expect(branding.appleTouchIcon).toBeUndefined()
    expect(branding.icon192).toBeUndefined()
    expect(branding.icon512).toBeUndefined()
  })
})
