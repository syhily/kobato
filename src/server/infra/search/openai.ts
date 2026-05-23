import { createHash } from 'node:crypto'

import { getLogger } from '@/server/infra/logger'
import { createInflight } from '@/server/infra/redis/inflight'
import { storage } from '@/server/infra/redis/storage'
import { getBlogSettingsBundleSync } from '@/shared/config/blog'
import { CACHE_BUCKET_FALLBACKS } from '@/shared/types/cache'

interface OpenAiConfig {
  apiKey: string
  baseURL: string
}

function getConfig(): OpenAiConfig | null {
  const bundle = getBlogSettingsBundleSync()
  if (bundle === null) {
    return null
  }

  const settings = bundle.search?.search
  if (!settings?.enabled || !settings.apiKey) {
    return null
  }

  const endpoint = settings.endpoint?.trim()
  const baseURL = endpoint || 'https://api.openai.com/v1'
  return { apiKey: settings.apiKey, baseURL }
}

// ---------------------------------------------------------------------------
// Embedding cache: binary Float32Array storage to minimise serialisation cost
// and memory footprint. 1536 floats @ 4 bytes each = 6144 bytes per key,
// versus ~12 KB for JSON stringified number[].
// ---------------------------------------------------------------------------

const embeddingInflight = createInflight<number[] | null>()

function encodeEmbedding(embedding: number[]): Buffer {
  return Buffer.from(new Float32Array(embedding).buffer)
}

function decodeEmbedding(raw: unknown): number[] | null {
  if (!Buffer.isBuffer(raw) || raw.length === 0 || raw.length % 4 !== 0) {
    return null
  }
  const view = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4)
  return Array.from(view)
}

function embeddingCacheKey(prefix: string, text: string): string {
  return `${prefix}${createHash('sha256').update(text).digest('hex')}`
}

export async function generateEmbedding(text: string): Promise<number[] | null> {
  const config = getConfig()
  if (config === null) {
    return null
  }

  const bundle = getBlogSettingsBundleSync()
  const model = bundle?.search?.search.model || 'text-embedding-3-small'

  const cacheSlot = bundle?.cache?.cache.embeddingSearch ?? CACHE_BUCKET_FALLBACKS.embeddingSearch
  const key = embeddingCacheKey(cacheSlot.prefix, text)

  // Hot path: single Redis round-trip on cache hit.
  const cachedRaw = await storage.getItemRaw(key)
  const cached = decodeEmbedding(cachedRaw)
  if (cached !== null) {
    getLogger('search.openai').info('Embedding cache hit', {
      key: key.slice(0, 40),
      dimensions: cached.length,
    })
    return cached
  }

  const input = text.replaceAll('\n', ' ').slice(0, 8000)
  getLogger('search.openai').info('Embedding request', { model, inputLength: input.length })

  // Coalesce concurrent cold loads for the same query text so a deploy spike
  // or a burst of identical searches doesn't fan out into N parallel API calls.
  return embeddingInflight(key, async () => {
    // Double-check: another concurrent request may have warmed the cache
    // while this promise was waiting in the inflight map.
    const doubleCheckRaw = await storage.getItemRaw(key)
    const doubleCheck = decodeEmbedding(doubleCheckRaw)
    if (doubleCheck !== null) {
      return doubleCheck
    }

    try {
      const url = `${config.baseURL}/embeddings`
      const response = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({ model, input, dimensions: 1536 }),
      })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        getLogger('search.openai').error('Embedding API returned non-2xx', {
          status: response.status,
          body: body.slice(0, 200),
          model,
        })
        return null
      }
      const json = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>
      }
      getLogger('search.openai').info('Embedding response', {
        model,
        dataLength: json.data?.length,
        firstDimensions: json.data?.[0]?.embedding?.length,
      })
      const embedding = json.data?.[0]?.embedding
      if (!Array.isArray(embedding) || embedding.length === 0) {
        getLogger('search.openai').error('Embedding generation returned invalid data', {
          model,
          hasData: json.data !== undefined,
          dataLength: json.data?.length,
          embeddingType: typeof embedding,
          hint: 'The configured endpoint or model may not support embeddings. Use a dedicated embedding model (e.g. text-embedding-3-small).',
        })
        return null
      }

      await storage.setItemRaw(key, encodeEmbedding(embedding), { ttl: cacheSlot.ttlSeconds })
      return embedding
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const isModelMismatch =
        message.includes('not open') || message.includes('undefined') || message.includes('Cannot read properties')
      getLogger('search.openai').error('Embedding generation failed', {
        error: message,
        model,
        hint: isModelMismatch
          ? 'The configured model may not support embeddings. Use a dedicated embedding model (e.g. text-embedding-3-small) instead of a chat model.'
          : undefined,
      })
      return null
    }
  })
}
