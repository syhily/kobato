import { parseISO } from 'date-fns'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CustomQuote, DailyQuoteSource } from '@/shared/config/types'

import { TEST_BLOG_SETTINGS_BUNDLE } from '#/_helpers/blog-settings'
import { setBlogSettingsBundleForTests } from '@/server/domains/settings/services/test-utils'
import { getDailyQuote, pickForDate } from '@/server/render/calendar/daily-quote'
import { LOCAL_QUOTES } from '@/server/render/calendar/local-quotes'

// `getDailyQuote` dispatches on the `sidebar.dailyQuote.source` setting and
// never throws — a remote outage must fall back to the deterministic local
// bank. We seed the settings snapshot per test and stub fetch (safeFetch
// runs on the global fetch), keeping the suite hermetic.

const DATE = parseISO('2024-04-24')
const originalFetch = globalThis.fetch

function seedSource(source: DailyQuoteSource, customQuotes: CustomQuote[] = []) {
  const baseSidebar = TEST_BLOG_SETTINGS_BUNDLE.sidebar
  if (baseSidebar === null) {
    throw new Error('TEST_BLOG_SETTINGS_BUNDLE is missing the sidebar section')
  }
  setBlogSettingsBundleForTests({
    ...TEST_BLOG_SETTINGS_BUNDLE,
    sidebar: { sidebar: { ...baseSidebar.sidebar, dailyQuote: { source, customQuotes } } },
  })
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  seedSource('shanbay')
  globalThis.fetch = vi.fn(async () =>
    jsonResponse({ content: 'to be', translation: '生存还是毁灭', author: '莎士比亚' }),
  )
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('render/calendar/daily-quote — remote providers', () => {
  it('maps the shanbay payload to content/author', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toMatch(/dailyquote/)
      return jsonResponse({ content: 'to be or not to be', translation: '做或不做', author: 'Shakespeare' })
    })
    globalThis.fetch = fetchMock

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual({ content: '做或不做', author: 'Shakespeare' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('maps the ONE payload (forward / words_info)', async () => {
    seedSource('one')
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toMatch(/wufazhuce/)
      return jsonResponse({ data: { content_list: [{ forward: '凡是过往，皆为序章。', words_info: '莎士比亚' }] } })
    })
    globalThis.fetch = fetchMock

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual({ content: '凡是过往，皆为序章。', author: '莎士比亚' })
  })

  it('maps the hitokoto payload (hitokoto / from)', async () => {
    seedSource('hitokoto')
    globalThis.fetch = vi.fn(async () => jsonResponse({ hitokoto: '风乍起，吹皱一池春水。', from: '谒金门' }))

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual({ content: '风乍起，吹皱一池春水。', author: '谒金门' })
  })

  it('tolerates a missing hitokoto `from`', async () => {
    seedSource('hitokoto')
    globalThis.fetch = vi.fn(async () => jsonResponse({ hitokoto: '无出处的一句。', from: null }))

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual({ content: '无出处的一句。', author: '' })
  })
})

describe('render/calendar/daily-quote — fallback to the built-in bank', () => {
  it('falls back when the remote API answers an HTTP error', async () => {
    globalThis.fetch = vi.fn(async () => new Response('nope', { status: 500 }))

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
  })

  it('falls back when the remote payload has an unexpected shape', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ unexpected: true }))

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
  })

  it('falls back when fetch rejects (network down / timeout)', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('connect ETIMEDOUT')
    })

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
  })

  it('falls back when a redirect hops to a blocked internal address (SSRF guard)', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } }),
    )

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
  })

  it('never throws, even when everything fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom')
    })

    await expect(getDailyQuote(DATE)).resolves.toBeDefined()
  })
})

describe('render/calendar/daily-quote — local sources', () => {
  const customQuotes: CustomQuote[] = Array.from({ length: 12 }, (_, i) => ({
    content: `自定义一言${i + 1}`,
    author: `作者${i + 1}`,
  }))

  it('picks from the custom bank when source=custom and ≥10 quotes are configured', async () => {
    seedSource('custom', customQuotes)
    const fetchMock = vi.fn(async (_url: unknown) => {
      throw new Error('fetch must not be called for a local source')
    })
    globalThis.fetch = fetchMock

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(customQuotes, DATE))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('behaves like source=local when the custom bank has fewer than 10 quotes', async () => {
    seedSource('custom', customQuotes.slice(0, 3))

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
  })

  it('picks from the built-in bank when source=local, without any remote call', async () => {
    seedSource('local')
    const fetchMock = vi.fn(async (_url: unknown) => {
      throw new Error('fetch must not be called for a local source')
    })
    globalThis.fetch = fetchMock

    const quote = await getDailyQuote(DATE)

    expect(quote).toEqual(pickForDate(LOCAL_QUOTES, DATE))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is deterministic for the same date', async () => {
    seedSource('local')

    const first = await getDailyQuote(DATE)
    const second = await getDailyQuote(DATE)

    expect(first).toEqual(second)
  })

  it('keeps every entry of a large bank reachable across years', () => {
    // The built-in bank holds 10k+ entries; day-of-year modulo would only
    // ever show the first 366. The hash pick must spread across the bank.
    const bank = Array.from({ length: 5000 }, (_, i) => ({ content: `一言${i}`, author: '作者' }))
    const picked = new Set<(typeof bank)[number]>()
    for (let year = 2024; year < 2034; year++) {
      for (let month = 0; month < 12; month++) {
        for (let day = 1; day <= 28; day++) {
          picked.add(pickForDate(bank, new Date(year, month, day)))
        }
      }
    }
    expect(picked.size).toBeGreaterThan(1000)
  })
})
