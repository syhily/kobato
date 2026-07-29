import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Database } from '@/server/infra/db/database'
import type { BrandingObjectRef } from '@/shared/config/types'

import { clearAllTables, getTestDb } from '#/_helpers/integration-db'
// uploadBrandingAsset / clearBrandingAsset orchestration against the REAL
// settings table: objects go to an in-memory storage backend (a true
// external — S3/local disk), the favicon-pack generator stays mocked
// (sharp), and every settings write is asserted by reading the row back
// from SQLite.
import { SECTION_REGISTRY } from '@/server/domains/settings/sections/registry'
import { findSettingByScope, upsertSetting } from '@/server/infra/db/operations/setting'

const storageMock = vi.hoisted(() => {
  const store = new Map<string, { body: Buffer; contentType: string }>()
  const deletedKeys: string[] = []
  const backend = {
    put: async ({ key, body, contentType }: { key: string; body: Buffer; contentType: string }) => {
      store.set(key, { body, contentType })
      return { key, size: body.length }
    },
    get: async (key: string) => {
      const entry = store.get(key)
      if (entry === undefined) {
        throw new Error(`storage mock: object not found: ${key}`)
      }
      return entry.body
    },
    delete: async (key: string) => {
      deletedKeys.push(key)
      store.delete(key)
    },
  }
  return {
    store,
    deletedKeys,
    backend,
    reset: () => {
      store.clear()
      deletedKeys.length = 0
    },
  }
})

vi.mock('@/server/infra/storage/registry', () => ({
  activeBackend: () => ({ backend: storageMock.backend, driver: 's3' }),
  backendFor: () => storageMock.backend,
}))

const generateFaviconPackMock = vi.hoisted(() => vi.fn())
vi.mock('@/server/domains/assets/generate', () => ({
  generateFaviconPack: generateFaviconPackMock,
}))

const { uploadBrandingAsset, clearBrandingAsset } = await import('@/server/domains/assets/management')

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
  await clearAllTables(db)
  storageMock.reset()
  vi.clearAllMocks()
  generateFaviconPackMock.mockResolvedValue({
    faviconIco: ICO_BYTES,
    appleTouchIcon: PNG_BYTES,
    icon192: PNG_BYTES,
    icon512: PNG_BYTES,
  })
  seedAssetsRow()
})

describe('uploadBrandingAsset', () => {
  it('uploads a single binary slot and writes an ObjectRef to the settings row', async () => {
    const ref = await uploadBrandingAsset(db, 'appleTouchIcon', PNG_BYTES)

    expect(ref.contentType).toBe('image/png')
    expect(ref.etag).toMatch(/^[a-f0-9]{64}$/)
    expect(ref.size).toBe(PNG_BYTES.length)
    expect(ref.driver).toBe('s3')

    const stored = storageMock.store.get('branding/apple-touch-icon.png')
    expect(stored).toBeDefined()
    expect(stored!.body.equals(PNG_BYTES)).toBe(true)
    expect(stored!.contentType).toBe('image/png')

    expect(readBranding().appleTouchIcon).toEqual(ref)
  })

  it('regenerates and uploads the full favicon pack on faviconSvg upload', async () => {
    await uploadBrandingAsset(db, 'faviconSvg', SVG_BYTES)

    expect(generateFaviconPackMock).toHaveBeenCalledTimes(1)
    expect([...storageMock.store.keys()].sort()).toEqual(
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
    expect(storageMock.deletedKeys).toContain('branding/favicon.svg')
    expect(storageMock.store.has('branding/favicon.svg')).toBe(false)
    // No settings write: the row carries no branding section at all.
    expect(readBranding()).toEqual({})
  })

  it('rejects mismatched content for a binary slot', async () => {
    // PNG bytes in an ICO slot should fail the magic-byte check.
    await expect(uploadBrandingAsset(db, 'faviconIco', PNG_BYTES)).rejects.toThrow(/image\/x-icon/)
    expect(storageMock.store.size).toBe(0)
  })

  it('rejects an SVG that contains a script tag', async () => {
    const hostile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8')
    await expect(uploadBrandingAsset(db, 'logoSvg', hostile)).rejects.toThrow(/脚本|事件处理器/)
    expect(storageMock.store.size).toBe(0)
  })
})

describe('clearBrandingAsset', () => {
  it('clears a single slot and removes the field from the settings row', async () => {
    seedAssetsRow({ appleTouchIcon: { etag: 'x', contentType: 'image/png', size: 1, updatedAt: '', driver: 's3' } })
    storageMock.reset() // drop the legacy-key deletes recorded during seeding — none happen, but keep counts honest

    await clearBrandingAsset(db, 'appleTouchIcon')

    // Deletes both the current key and the legacy (extensionless) key.
    expect(storageMock.deletedKeys).toHaveLength(2)
    expect(storageMock.deletedKeys).toContain('branding/apple-touch-icon.png')
    expect(storageMock.deletedKeys).toContain('branding/apple-touch-icon')

    expect(readBranding().appleTouchIcon).toBeUndefined()
  })

  it('clears favicon pack when faviconSvg is cleared', async () => {
    await clearBrandingAsset(db, 'faviconSvg')

    // 5 slots × 2 keys (current + legacy) = 10 deletes
    expect(storageMock.deletedKeys).toHaveLength(10)
    expect(storageMock.deletedKeys).toEqual(
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
