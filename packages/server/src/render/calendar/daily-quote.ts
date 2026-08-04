import type { CustomQuote, DailyQuoteSource } from '@kobato/shared/config/types'

import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { LOCAL_QUOTES } from '@kobato/server/render/calendar/local-quotes'
import { requireBlogSettingsSection } from '@kobato/shared/config/getters'
import { isRecord } from '@kobato/shared/utils/type-guards'
import { format } from 'date-fns'

// Daily-quote sources for the calendar image. The source is configured in
// the `sidebar` settings section (`dailyQuote.source`):
//
//   shanbay (default) / one / hitokoto — one remote call; any failure
//     (network, HTTP error, SSRF guard, bad payload) falls back to the
//     built-in bank — the endpoint never 500s on a quote outage.
//   custom — the admin-uploaded bank (≥ 10 entries); below that it
//     silently behaves like `local`.
//   local  — the built-in bank, no remote call at all.
//
// Known degradations of the remote providers:
//   - ONE (`v3.wufazhuce.com`) has no date parameter — it only serves
//     "today", so historical calendar dates also render today's entry.
//   - hitokoto returns a random quote per call; the rendered PNG cache
//     freezes whichever quote was drawn until the cache TTL expires.

const log = getLogger('calendar')

const FETCH_OPTIONS = { timeoutMs: 5_000, maxBytes: 64_000 } as const

export interface DailyQuote {
  content: string
  author: string
}

// FNV-1a over the ISO date, modulo the bank length. Deterministic per
// date — a re-render after the PNG cache expires still shows the same
// quote — and, unlike day-of-year modulo, every entry of a bank larger
// than 366 stays reachable across years.
export function pickForDate(bank: readonly DailyQuote[], date: Date): DailyQuote {
  const key = format(date, 'yyyy-MM-dd')
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return bank[(hash >>> 0) % bank.length]
}

function parseJson(body: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(body))
}

// --- 扇贝 (shanbay) ---

function isShanbayPayload(value: unknown): value is { translation: string; author: string } {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.translation === 'string' && typeof value.author === 'string'
}

async function fetchShanbay(date: Date): Promise<DailyQuote> {
  const url = `https://apiv3.shanbay.com/weapps/dailyquote/quote?date=${format(date, 'yyyy-MM-dd')}`
  const res = await safeFetch(url, FETCH_OPTIONS)
  if (!res.ok) {
    throw new Error(res.reason)
  }
  const parsed: unknown = parseJson(res.body)
  if (!isShanbayPayload(parsed)) {
    throw new Error('bad-payload')
  }
  return { content: parsed.translation, author: parsed.author }
}

// --- ONE 一个 ---

function isOnePayload(
  value: unknown,
): value is { data: { content_list: { forward: string; words_info?: unknown }[] } } {
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.content_list)) {
    return false
  }
  const first: unknown = value.data.content_list[0]
  return isRecord(first) && typeof first.forward === 'string'
}

async function fetchOne(): Promise<DailyQuote> {
  const res = await safeFetch('http://v3.wufazhuce.com:8000/api/channel/one/0/0', FETCH_OPTIONS)
  if (!res.ok) {
    throw new Error(res.reason)
  }
  const parsed: unknown = parseJson(res.body)
  if (!isOnePayload(parsed)) {
    throw new Error('bad-payload')
  }
  const first = parsed.data.content_list[0]
  return { content: first.forward, author: typeof first.words_info === 'string' ? first.words_info : '' }
}

// --- 一言 (hitokoto) ---

function isHitokotoPayload(value: unknown): value is { hitokoto: string; from?: unknown } {
  return isRecord(value) && typeof value.hitokoto === 'string'
}

async function fetchHitokoto(): Promise<DailyQuote> {
  const res = await safeFetch('https://v1.hitokoto.cn/', FETCH_OPTIONS)
  if (!res.ok) {
    throw new Error(res.reason)
  }
  const parsed: unknown = parseJson(res.body)
  if (!isHitokotoPayload(parsed)) {
    throw new Error('bad-payload')
  }
  return { content: parsed.hitokoto, author: typeof parsed.from === 'string' ? parsed.from : '' }
}

const REMOTE_PROVIDERS: Record<Exclude<DailyQuoteSource, 'custom' | 'local'>, (date: Date) => Promise<DailyQuote>> = {
  shanbay: fetchShanbay,
  one: fetchOne,
  hitokoto: fetchHitokoto,
}

export async function getDailyQuote(date: Date): Promise<DailyQuote> {
  const { dailyQuote } = requireBlogSettingsSection('sidebar').sidebar
  if (dailyQuote.source === 'local') {
    return pickForDate(LOCAL_QUOTES, date)
  }
  if (dailyQuote.source === 'custom') {
    const bank: readonly CustomQuote[] = dailyQuote.customQuotes
    return pickForDate(bank.length >= 10 ? bank : LOCAL_QUOTES, date)
  }
  const source = dailyQuote.source
  try {
    return await REMOTE_PROVIDERS[source](date)
  } catch (err) {
    log.warn('每日一言远程接口失败，回退到内置一言库', {
      provider: source,
      reason: err instanceof Error ? err.message : String(err),
    })
    return pickForDate(LOCAL_QUOTES, date)
  }
}
