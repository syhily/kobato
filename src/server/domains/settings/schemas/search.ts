import { z } from 'zod'

import { coerceBoolean } from '@/server/domains/settings/schemas/shared'

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
