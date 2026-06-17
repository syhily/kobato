import { Buffer } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageMock = {
  getItemRaw: vi.fn<() => Promise<Buffer | null>>(),
  setItemRaw: vi.fn<() => Promise<void>>(),
}

const inflightFn = vi.fn<(key: string, run: () => Promise<Buffer>) => Promise<Buffer>>()
const createInflightMock = vi.fn(() => inflightFn)

vi.mock('@/server/infra/redis/storage', () => ({
  storage: storageMock,
}))

vi.mock('@/server/infra/redis/inflight', () => ({
  createInflight: createInflightMock,
}))

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
      storageMock.getItemRaw.mockResolvedValue(cached)
      const loader = vi.fn<() => Promise<Buffer>>()

      const { loadBuffer } = await import('@/server/infra/redis/buffer-cache')
      const result = await loadBuffer('key', loader, 60)

      expect(result).toBe(cached)
      expect(storageMock.getItemRaw).toHaveBeenCalledWith('key')
      expect(loader).not.toHaveBeenCalled()
      expect(storageMock.setItemRaw).not.toHaveBeenCalled()
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('loads, stores, and returns buffer on cache miss in production', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = true
    try {
      storageMock.getItemRaw.mockResolvedValue(null)
      const loaded = Buffer.from('loaded')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/redis/buffer-cache')
      const result = await loadBuffer('key', loader, 120)

      expect(result).toBe(loaded)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(storageMock.setItemRaw).toHaveBeenCalledWith('key', loaded, { ttl: 120 })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('skips Redis read and always loads in development', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = false
    try {
      const loaded = Buffer.from('dev-loaded')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/redis/buffer-cache')
      const result = await loadBuffer('key', loader, 60)

      expect(result).toBe(loaded)
      expect(storageMock.getItemRaw).not.toHaveBeenCalled()
      expect(loader).toHaveBeenCalledTimes(1)
      expect(storageMock.setItemRaw).toHaveBeenCalledWith('key', loaded, { ttl: 60 })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })

  it('wraps the loader through the inflight coalescer on cache miss', async () => {
    const originalProd = import.meta.env.PROD
    ;(import.meta.env as any).PROD = true
    try {
      storageMock.getItemRaw.mockResolvedValue(null)
      const loaded = Buffer.from('loaded-once')
      const loader = vi.fn<() => Promise<Buffer>>().mockResolvedValue(loaded)

      const { loadBuffer } = await import('@/server/infra/redis/buffer-cache')
      const result = await loadBuffer('key', loader, 60)

      expect(result).toBe(loaded)
      expect(inflightFn).toHaveBeenCalledWith('key', expect.any(Function))
      expect(loader).toHaveBeenCalledTimes(1)
      expect(storageMock.setItemRaw).toHaveBeenCalledWith('key', loaded, { ttl: 60 })
    } finally {
      ;(import.meta.env as any).PROD = originalProd
      vi.resetModules()
    }
  })
})
