// Server-side telemetry privacy boundary.
//
// SDK-free on purpose: the runtime applies it before any value reaches an OTel
// span, so the allowlist — not the caller — decides what can leave the process.
// Arbitrary messages, stacks, URLs, headers, and raw paths have no route here.

import type { SpanAttributeValue, SpanAttributes } from '@/server/infra/trace/facade'

import { CACHE_BUCKET_IDS } from '@/shared/types/cache'

/**
 * Closed set of span attributes. A new boundary adds its own low-cardinality
 * keys here instead of passing an ad-hoc attribute through.
 */
const SPAN_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  'http.request.method',
  'http.route',
  'http.response.status_code',
  'http.client.operation',
  'rr.request.kind',
  'rr.route',
  'orpc.procedure',
  'orpc.transport',
  'ssr.phase',
  'ssr.outcome',
  'db.engine',
  'db.operation',
  'db.outcome',
  'db.statement',
  'cache.bucket',
  'cache.result',
  'cache.coalesced',
  'image.operation',
  'image.size_bucket',
  'image.outcome',
  'job.name',
  'job.task_key',
  'rum.relay.outcome',
  'error.type',
  'error.category',
])

/**
 * Closed, boundary-owned vocabularies. Call sites use these unions so a raw
 * URL/host/path can never be passed as an operation name, and the sanitizer
 * re-checks the value before it reaches an SDK.
 */
export const SAFE_FETCH_OPERATIONS = [
  'unspecified',
  'music.asset',
  'music.proxy',
  'comments.avatar',
  'comments.avatar.probe',
  'comments.avatar.github',
  'webmentions.send',
  'webmentions.discover',
  'webmentions.source',
  'calendar.quote.shanbay',
  'calendar.quote.wufazhuce',
  'calendar.quote.hitokoto',
  'observability.o2',
  'observability.rum.relay',
  'og.cover',
] as const
export type SafeFetchOperation = (typeof SAFE_FETCH_OPERATIONS)[number]

export const IMAGE_OPERATIONS = ['unspecified', 'images.upload', 'images.mutate', 'music.cover'] as const
export type ImageOperation = (typeof IMAGE_OPERATIONS)[number]

export const IMAGE_SIZE_BUCKETS = ['unknown', 'lt_64kb', 'lt_256kb', 'lt_1mb', 'lt_4mb', 'gte_4mb'] as const
export type ImageSizeBucket = (typeof IMAGE_SIZE_BUCKETS)[number]

export const DB_ENGINES = ['sqlite', 'duckdb'] as const
export type DbEngine = (typeof DB_ENGINES)[number]

export const DB_OUTCOMES = ['success', 'error'] as const
export type DbOutcome = (typeof DB_OUTCOMES)[number]

/** Closed terminal outcomes of one relayed RUM batch (client-shape rejections are not relay health). */
export const RUM_RELAY_OUTCOMES = ['ok', 'upstream_error', 'rate_limited', 'oversized'] as const
export type RumRelayOutcome = (typeof RUM_RELAY_OUTCOMES)[number]

const MAX_ATTRIBUTE_STRING_LENGTH = 128
const MAX_STATEMENT_LENGTH = 512

const VALUE_SETS: Readonly<Record<string, ReadonlySet<string>>> = {
  'orpc.transport': new Set(['http', 'in_process']),
  'rr.request.kind': new Set(['data', 'document']),
  'ssr.phase': new Set(['shell', 'stream']),
  'ssr.outcome': new Set(['ok', 'error', 'completed', 'aborted']),
  'db.engine': new Set(['sqlite', 'duckdb']),
  'db.outcome': new Set(['success', 'error']),
  'cache.bucket': new Set(CACHE_BUCKET_IDS),
  'cache.result': new Set(['hit', 'miss']),
  'image.operation': new Set(IMAGE_OPERATIONS),
  'image.size_bucket': new Set(IMAGE_SIZE_BUCKETS),
  'image.outcome': new Set(['success', 'error']),
  'http.client.operation': new Set(SAFE_FETCH_OPERATIONS),
  'rum.relay.outcome': new Set(RUM_RELAY_OUTCOMES),
}

const VALUE_PATTERNS: Readonly<Record<string, RegExp>> = {
  'http.request.method': /^[A-Z]{3,10}$/,
  'http.route': /^\/?[A-Za-z0-9_:*./-]{0,128}$/,
  'rr.route': /^\/?[A-Za-z0-9_:*./-]{0,128}$/,
  'orpc.procedure': /^[A-Za-z0-9_.]{1,128}$/,
  'db.operation': /^[a-z][a-z0-9_]{0,31}$/,
  'job.name': /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/,
  'job.task_key': /^[a-z0-9][a-z0-9-]{0,63}$/,
  'error.type': /^[A-Za-z][A-Za-z0-9_]{0,63}$/,
  'error.category': /^[a-z0-9_]{1,64}$/,
}

const ROUTE_KEYS: ReadonlySet<string> = new Set(['http.route', 'rr.route'])

/** Standard + application error class names worth distinguishing in a dashboard. */
const SAFE_ERROR_TYPES: ReadonlySet<string> = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'ReferenceError',
  'EvalError',
  'URIError',
  'AggregateError',
  'AbortError',
  'TimeoutError',
  'ORPCError',
  'HTTPException',
  'DomainError',
  'ActionFailure',
])

const STABLE_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/

export type SanitizedAttribute = readonly [key: string, value: string | number | boolean]

function sanitizeString(value: string): string {
  let sanitized = ''
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code >= 0x20 && code !== 0x7f) {
      sanitized += character
    }
  }
  return sanitized
}

function sanitizeValue(key: string, value: SpanAttributeValue): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null
  }
  if (key === 'cache.coalesced') {
    return typeof value === 'boolean' ? value : null
  }
  if (key === 'http.response.status_code') {
    return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null
  }
  // Every other allowlisted key is a closed string (or the coalesced boolean
  // handled above); a number/boolean cannot impersonate a route or operation.
  if (typeof value !== 'string') {
    return null
  }

  const sanitized = sanitizeString(value)
  if (sanitized.length === 0) {
    return null
  }
  const bounded = sanitized.slice(0, key === 'db.statement' ? MAX_STATEMENT_LENGTH : MAX_ATTRIBUTE_STRING_LENGTH)
  if (ROUTE_KEYS.has(key) && bounded.includes('://')) {
    return null
  }
  const allowed = VALUE_SETS[key]
  if (allowed !== undefined && !allowed.has(bounded)) {
    return null
  }
  const pattern = VALUE_PATTERNS[key]
  if (pattern !== undefined && !pattern.test(bounded)) {
    return null
  }
  return bounded
}

/**
 * Validate one value against a known attribute key. The key itself must be in
 * the span allowlist; metrics build their own key allowlist on top.
 */
export function sanitizeAttributeValue(key: string, value: SpanAttributeValue): string | number | boolean | null {
  if (!SPAN_ATTRIBUTE_KEYS.has(key)) {
    return null
  }
  return sanitizeValue(key, value)
}

/** Project one attribute through the allowlist; `null` means drop it. */
export function sanitizeSpanAttribute(key: string, value: SpanAttributeValue): SanitizedAttribute | null {
  if (!SPAN_ATTRIBUTE_KEYS.has(key)) {
    return null
  }
  const sanitized = sanitizeValue(key, value)
  if (sanitized === null) {
    return null
  }
  return [key, sanitized]
}

/** Project a whole attribute bag, dropping every key outside the allowlist. */
export function sanitizeSpanAttributes(
  attributes: SpanAttributes | undefined,
): Record<string, string | number | boolean> {
  const projected: Record<string, string | number | boolean> = {}
  if (attributes === undefined) {
    return projected
  }
  for (const [key, value] of Object.entries(attributes)) {
    const entry = sanitizeSpanAttribute(key, value)
    if (entry !== null) {
      projected[entry[0]] = entry[1]
    }
  }
  return projected
}

export interface ErrorProjection {
  /** Safe, closed-set error class name. */
  type: string
  /** Stable low-cardinality category derived from the error's code/status. */
  category: string
}

function safeStatus(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null
}

function safeCode(value: unknown): string | null {
  return typeof value === 'string' && STABLE_CODE_PATTERN.test(value) ? value.toLowerCase() : null
}

function readField(value: unknown, key: string): unknown {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined
  }
  return Reflect.get(value, key)
}

function safeErrorName(error: unknown): string {
  if (error === null || typeof error !== 'object') {
    return 'NonError'
  }
  // Only the closed allowlist can name an error; a hostile value degrades to
  // 'Error' instead of echoing arbitrary content.
  const named = readField(error, 'name')
  return typeof named === 'string' && SAFE_ERROR_TYPES.has(named) ? named : 'Error'
}

/**
 * Reduce a thrown value to a name plus a stable category. Message, stack,
 * cause, URL, and arbitrary string values are never read into the projection.
 */
export function projectError(error: unknown): ErrorProjection {
  if (error instanceof Response) {
    const status = safeStatus(error.status)
    return { type: 'Response', category: status === null ? 'http_unknown' : `http_${status}` }
  }

  const code = safeCode(readField(error, 'code'))
  const status = safeStatus(readField(error, 'status'))

  // oRPC leaves `Error.name` generic; its stable code + HTTP status pair is the
  // structural signature. No message/input is involved.
  if (code !== null && status !== null) {
    return { type: 'ORPCError', category: `orpc_${code}` }
  }

  const type = safeErrorName(error)

  if (type === 'AbortError') {
    return { type, category: 'aborted' }
  }
  if (type === 'DomainError') {
    return { type, category: code === null ? 'domain_unknown' : `domain_${code}` }
  }
  if (status !== null) {
    return { type, category: `http_${status}` }
  }
  return { type, category: 'unknown' }
}
