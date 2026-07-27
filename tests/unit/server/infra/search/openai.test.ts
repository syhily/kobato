import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openaiState = vi.hoisted(() => ({
  through: vi.fn(),
}))

vi.mock('@/server/infra/cache/registry', () => ({
  through: (db: unknown, id: unknown, params: unknown, loader: () => Promise<unknown>, options?: unknown) =>
    openaiState.through(db, id, params, loader, options),
}))

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '#/_helpers/blog-settings'
import { generateEmbedding } from '@/server/infra/search/openai'

// The db handle is only forwarded to the mocked cache module — a stand-in
// is enough for the unit scope. (The Float32 codec and cacheWhen policy
// are covered by the registry module's own unit tests.)
const db = {} as NodePgDatabase

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
  openaiState.through.mockReset()
  // Default: a cache miss — run the loader and return its value.
  openaiState.through.mockImplementation(
    (_db: unknown, _id: unknown, _params: unknown, loader: () => Promise<unknown>) => loader(),
  )
  vi.unstubAllGlobals()
  setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('infra/search/openai — generateEmbedding', () => {
  it('returns null when search is disabled', async () => {
    setBlogSettingsBundleForTests(TEST_BLOG_SETTINGS_BUNDLE)
    expect(await generateEmbedding(db, 'hi')).toBeNull()
    expect(openaiState.through).not.toHaveBeenCalled()
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
    expect(await generateEmbedding(db, 'hi')).toBeNull()
    expect(openaiState.through).not.toHaveBeenCalled()
  })

  it('returns null when the configured endpoint is not on the allowlist', async () => {
    enableSearchBundle({ endpoint: 'https://evil.example/v1' })
    expect(await generateEmbedding(db, 'hi')).toBeNull()
    expect(openaiState.through).not.toHaveBeenCalled()
  })

  it('caches through the embeddingSearch declaration with the raw text', async () => {
    enableSearchBundle()
    const cached = [0.1, 0.2, 0.3]
    openaiState.through.mockResolvedValue(cached)

    const result = await generateEmbedding(db, 'hi')

    expect(result).toEqual(cached)
    expect(openaiState.through).toHaveBeenCalledWith(
      db,
      'embeddingSearch',
      { text: 'hi' },
      expect.any(Function),
      expect.objectContaining({ onHit: expect.any(Function) }),
    )
  })

  it('fetches an embedding on a miss', async () => {
    enableSearchBundle()
    const embedding = [0.4, 0.5, 0.6]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ embedding }] }), { status: 200 })),
    )
    const result = await generateEmbedding(db, 'hello world')
    expect(result).toEqual(embedding)
  })

  it('returns null on a non-2xx response', async () => {
    enableSearchBundle()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 500 })))
    expect(await generateEmbedding(db, 'hi')).toBeNull()
  })

  it('returns null when the JSON shape is invalid', async () => {
    enableSearchBundle()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ notData: true }), { status: 200 })))
    expect(await generateEmbedding(db, 'hi')).toBeNull()
  })

  it('returns null when data array is empty', async () => {
    enableSearchBundle()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 })))
    expect(await generateEmbedding(db, 'hi')).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    enableSearchBundle()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await generateEmbedding(db, 'hi')).toBeNull()
  })
})
