import type { BlogSettingsBundle, CustomQuote, DailyQuoteSource } from '@kobato/settings/types'

import { isRecord } from '@kobato/base/utils/type-guards'
import { getLogger } from '@kobato/server/infra/logger'
import { safeFetch } from '@kobato/server/infra/safe-fetch'
import { LOCAL_QUOTES } from '@kobato/server/render/calendar/local-quotes'
import { requireBlogSettingsSection } from '@kobato/settings/getters'
import { format } from 'date-fns'

const log = getLogger('calendar')

const FETCH_OPTIONS = { timeoutMs: 5_000, maxBytes: 64_000 } as const

export interface DailyQuote {
  content: string
  author: string
}

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

function isShanbayPayload(value: unknown): value is { translation: string; author: string } {
  if (!isRecord(value)) {
    return false
  }
  return typeof value.translation === 'string' && typeof value.author === 'string'
}

async function fetchShanbay(date: Date): Promise<DailyQuote> {
  const url = `https://apiv3.shanbay.com/weapps/dailyquote/quote?date=${format(date, 'yyyy-MM-dd')}`
  const res = await safeFetch(url, { ...FETCH_OPTIONS, operation: 'calendar.quote.shanbay' })
  if (!res.ok) {
    throw new Error(res.reason)
  }
  const parsed: unknown = parseJson(res.body)
  if (!isShanbayPayload(parsed)) {
    throw new Error('bad-payload')
  }
  return { content: parsed.translation, author: parsed.author }
}

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
  const res = await safeFetch('http://v3.wufazhuce.com:8000/api/channel/one/0/0', {
    ...FETCH_OPTIONS,
    allowNonStandardPort: true,
    operation: 'calendar.quote.wufazhuce',
  })
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

function isHitokotoPayload(value: unknown): value is { hitokoto: string; from?: unknown } {
  return isRecord(value) && typeof value.hitokoto === 'string'
}

async function fetchHitokoto(): Promise<DailyQuote> {
  const res = await safeFetch('https://v1.hitokoto.cn/', { ...FETCH_OPTIONS, operation: 'calendar.quote.hitokoto' })
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

export async function getDailyQuote(date: Date, settings?: BlogSettingsBundle | null): Promise<DailyQuote> {
  const { dailyQuote } = requireBlogSettingsSection('sidebar', settings).sidebar
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
    log.warn('Daily quote fetch failed; falling back to the built-in quote library', {
      provider: source,
      reason: err instanceof Error ? err.message : String(err),
    })
    return pickForDate(LOCAL_QUOTES, date)
  }
}
