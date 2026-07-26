import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

import { through } from '@/server/infra/cache/registry'
import { getLogger } from '@/server/infra/logger'
import { INFRA_SEARCH_DEFAULTS } from '@/server/infra/search/defaults'
import { getBlogSettingsBundleSync } from '@/shared/config/getters'
import { isRecord } from '@/shared/utils/type-guards'

interface OpenAiConfig {
  apiKey: string
  baseURL: string
}

const ALLOWED_HOSTS = ['api.openai.com', 'api.openai.com:443']

function isAllowedBaseURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ALLOWED_HOSTS.includes(parsed.host)
  } catch {
    return false
  }
}

function isEmbeddingResponse(value: unknown): value is { data: Array<{ embedding?: number[] }> } {
  if (!isRecord(value)) {
    return false
  }
  const data = value.data
  if (!Array.isArray(data)) {
    return false
  }
  return data.every((item) => isRecord(item) && (item.embedding === undefined || Array.isArray(item.embedding)))
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
  if (endpoint && !isAllowedBaseURL(baseURL)) {
    getLogger('search.openai').error('Configured search endpoint is not in the allowlist', {
      host: new URL(baseURL).host,
      allowed: ALLOWED_HOSTS,
    })
    return null
  }
  return { apiKey: settings.apiKey, baseURL }
}

// Embedding cache: binary Float32Array storage (1536 floats = 6144
// bytes/key versus ~12 KB JSON). The codec and the never-cache-null
// policy (cacheWhen) live on the `embeddingSearch` cache declaration.

export async function generateEmbedding(db: NodePgDatabase, text: string): Promise<number[] | null> {
  const config = getConfig()
  if (config === null) {
    return null
  }

  const bundle = getBlogSettingsBundleSync()
  const model = bundle?.search?.search.model || INFRA_SEARCH_DEFAULTS.model

  const input = text.replaceAll('\n', ' ').slice(0, 8000)
  getLogger('search.openai').info('Embedding request', { model, inputLength: input.length })

  return through(
    db,
    'embeddingSearch',
    { text },
    async () => {
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
        const parsed: unknown = await response.json()
        const json = isEmbeddingResponse(parsed) ? parsed : null
        if (json === null) {
          getLogger('search.openai').error('Embedding generation returned invalid JSON', { model })
          return null
        }
        getLogger('search.openai').info('Embedding response', {
          model,
          dataLength: json.data.length,
          firstDimensions: json.data[0]?.embedding?.length,
        })
        const embedding = json.data[0]?.embedding
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
    },
    {
      onHit: (cached) => {
        // V is `number[] | null` because the loader can fail — a cache
        // hit is always the stored embedding.
        if (cached !== null) {
          getLogger('search.openai').info('Embedding cache hit', {
            dimensions: cached.length,
          })
        }
      },
    },
  )
}
