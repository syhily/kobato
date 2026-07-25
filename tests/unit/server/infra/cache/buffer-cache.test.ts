import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const kvStoreMock = {
  getItemRaw: vi.fn<(db: unknown, key: string) => Promise<Buffer | null>>(),
  setItemRaw: vi.fn<(db: unknown, key: string, value: Buffer, opts?: unknown) => Promise<void>>(),
}

const inflightFn = vi.fn<(key: string, run: () => Promise<Buffer>) => Promise<Buffer>>()
const createInflightMock = vi.fn(() => inflightFn)

vi.mock('@/server/infra/cache/kv-store', () => kvStoreMock)

vi.mock('@/server/infra/cache/inflight', () => ({
  createInflight: createInflightMock,
}))

// The db handle is only forwarded to the mocked kv-store — a stand-in is
// enough for the unit scope.
const db = {} as NodePgDatabase

describe('buffer-cache/loadBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    inflightFn.mockImplementation((_key, run) => run())
  })

  it('returns cached buffer on cache hit in production', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = true
    try {
      const cached = Buffer.from('cached')
      kvStoreMock.getItemRaw.mockResolvedValue(cached)
      const loader = vi.fn<() => Promise<Buffer>>()

      const { loadBuffer } = await import('@/server/infra/cache/buffer-cache')
      const result = await loadBuffer(db, 'key', loader, 60, 'og')

      expect(result).toBe(cached)
      expect(kvStoreMock.getItemRaw).toHaveBeenCalledWith(db, 'key')
      expect(loader).not.toHaveBeenCalled()
      expect(kvStoreMock.setItemRaw).not.toHaveBeenCalled()
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('loads, stores, and returns buffer on cache miss in production', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = true
    try {
      kvStoreMock.getItemRaw.mockResolvedValue(null)
      const loaded = Buffer.from('loaded')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/cache/buffer-cache')
      const result = await loadBuffer(db, 'key', loader, 120, 'calendar')

      expect(result).toBe(loaded)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(kvStoreMock.setItemRaw).toHaveBeenCalledWith(db, 'key', loaded, {
        ttlSeconds: 120,
        bucket: 'calendar',
      })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('skips the kv read and always loads in development', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = false
    try {
      const loaded = Buffer.from('dev-loaded')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/cache/buffer-cache')
      const result = await loadBuffer(db, 'key', loader, 60, 'og')

      expect(result).toBe(loaded)
      expect(kvStoreMock.getItemRaw).not.toHaveBeenCalled()
      expect(loader).toHaveBeenCalledTimes(1)
      expect(kvStoreMock.setItemRaw).toHaveBeenCalledWith(db, 'key', loaded, { ttlSeconds: 60, bucket: 'og' })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('wraps the loader through the inflight coalescer on cache miss', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = true
    try {
      kvStoreMock.getItemRaw.mockResolvedValue(null)
      const loaded = Buffer.from('loaded-once')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/cache/buffer-cache')
      const result = await loadBuffer(db, 'key', loader, 60, 'og')

      expect(result).toBe(loaded)
      expect(inflightFn).toHaveBeenCalledWith('key', expect.any(Function))
      expect(loader).toHaveBeenCalledTimes(1)
      expect(kvStoreMock.setItemRaw).toHaveBeenCalledWith(db, 'key', loaded, { ttlSeconds: 60, bucket: 'og' })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })
})
