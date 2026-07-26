import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/sections/shared'

export const searchSchema = z.object({
  search: z.object({
    enabled: coerceBoolean,
    mode: z.enum(['vector', 'like', 'trgm']).default('trgm'),
    /** OpenAI-compatible API endpoint. Empty string means use the official OpenAI endpoint. */
    endpoint: z.union([z.literal(''), z.url()]),
    apiKey: z.string().trim().max(512).optional(),
    model: z.string().trim().max(80).default('text-embedding-3-small'),
    similarityThreshold: z.coerce.number().min(0).max(1).default(0.5),
    /**
     * Minimum `word_similarity()` score for the pg_trgm fuzzy-match
     * branch (trgm mode only). Verbatim substring hits always match via
     * the ILIKE fallback regardless of this value.
     */
    trgmThreshold: z.coerce.number().min(0).max(1).default(0.3),
  }),
})

export const searchDefaults = {
  search: {
    enabled: false,
    mode: 'trgm' as const,
    endpoint: '',
    apiKey: '',
    model: 'text-embedding-3-small',
    similarityThreshold: 0.5,
    trgmThreshold: 0.3,
  },
} as const

export const searchSection = {
  scope: 'blog.search',
  key: 'search',
  schema: searchSchema,
  defaults: searchDefaults,
} as const
