import { Buffer } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openaiState = vi.hoisted(() => ({
  getItemRaw: vi.fn<(key: string) => Promise<unknown>>(),
  setItemRaw: vi.fn<(key: string, value: Buffer, opts?: unknown) => Promise<void>>(),
  inflight: vi.fn(<T>(_key: string, run: () => Promise<T>) => run()),
}))

vi.mock('@/server/infra/redis/storage', () => ({
  storage: {
    getItemRaw: (key: string) => openaiState.getItemRaw(key),
    setItemRaw: (key: string, value: Buffer, opts?: unknown) => openaiState.setItemRaw(key, value, opts),
  },
}))
vi.mock('@/server/infra/redis/inflight', () => ({
  createInflight: () => (key: string, run: () => Promise<unknown>) => openaiState.inflight(key, run),
}))

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { generateEmbedding } from '@/server/infra/search/openai'

function encode(arr: number[]): Buffer {
  return Buffer.from(new Float32Array(arr).buffer)
}

function enableSearchBundle(overrides?: Record<string, unknown>) {
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    search: {
      search: {
        enabled: true,
        mode: 'vector',
        endpoint: '',
        apiKey: 'test-key',
        model: 'text-embedding-3-small',
        similarityThreshold: 0.5,
        trgmThreshold: 0.3,
        ...overrides,
      },
    },
  })
}

beforeEach(() => {
  openaiState.getItemRaw.mockReset()
  openaiState.setItemRaw.mockReset()
  openaiState.inflight.mockReset()
  openaiState.inflight.mockImplementation(<T>(_key: string, run: () => Promise<T>) => run())
  vi.unstubAllGlobals()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('infra/search/openai — generateEmbedding', () => {
  it('returns null when search is disabled', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns null when apiKey is missing', async () => {
    setBlogSettingsBundleForTests({
      ...TEST_BLOG_SETTINGS_BUNDLE,
      search: {
        search: {
          enabled: true,
          mode: 'vector',
          endpoint: '',
          apiKey: '',
          model: 'text-embedding-3-small',
          similarityThreshold: 0.5,
          trgmThreshold: 0.3,
        },
      },
    })
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns null when the configured endpoint is not on the allowlist', async () => {
    enableSearchBundle({ endpoint: 'https://evil.example/v1' })
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns the cached embedding on a hit', async () => {
    enableSearchBundle()
    const cached = [0.1, 0.2, 0.3]
    openaiState.getItemRaw.mockResolvedValue(encode(cached))
    const result = await generateEmbedding('hi')
    expect(result).toHaveLength(cached.length)
    for (let i = 0; i < cached.length; i += 1) {
      expect(result![i]).toBeCloseTo(cached[i], 5)
    }
    expect(openaiState.setItemRaw).not.toHaveBeenCalled()
  })

  it('fetches and caches an embedding on a miss', async () => {
    enableSearchBundle()
    openaiState.getItemRaw.mockResolvedValue(null)
    const embedding = [0.4, 0.5, 0.6]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding }] }), { status: 200 })),
    )
    const result = await generateEmbedding('hello world')
    expect(result).toEqual(embedding)
    expect(openaiState.setItemRaw).toHaveBeenCalled()
  })

  it('returns null on a non-2xx response', async () => {
    enableSearchBundle()
    openaiState.getItemRaw.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 500 })))
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns null when the JSON shape is invalid', async () => {
    enableSearchBundle()
    openaiState.getItemRaw.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ notData: true }), { status: 200 })))
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns null when data array is empty', async () => {
    enableSearchBundle()
    openaiState.getItemRaw.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })))
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    enableSearchBundle()
    openaiState.getItemRaw.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await generateEmbedding('hi')).toBeNull()
  })

  it('uses the inflight cache result when another request already warmed it', async () => {
    enableSearchBundle()
    const cached = [0.7, 0.8]
    openaiState.getItemRaw.mockResolvedValueOnce(null).mockResolvedValueOnce(encode(cached))
    const result = await generateEmbedding('hi')
    expect(result).toHaveLength(cached.length)
    for (let i = 0; i < cached.length; i += 1) {
      expect(result![i]).toBeCloseTo(cached[i], 5)
    }
  })
})
