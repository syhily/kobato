import { extractRequestFacts } from '@kobato/server/http/request/request-facts'
import { describe, expect, it } from 'vitest'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

function request(headers: Record<string, string> = {}, url = 'https://example.com/posts/x'): Request {
  return new Request(url, { headers })
}

describe('extractRequestFacts', () => {
  it('mints a fresh analytics event id per request', () => {
    const first = extractRequestFacts(request())
    const second = extractRequestFacts(request())

    expect(first.analyticsEventId).toMatch(UUID_RE)
    expect(second.analyticsEventId).toMatch(UUID_RE)
    expect(first.analyticsEventId).not.toBe(second.analyticsEventId)
  })

  it('adopts a syntactically valid inbound analytics event id', () => {
    const facts = extractRequestFacts(request({ 'x-kobato-analytics-event': '4D2E6C1A-9F2B-4C3D-8E5F-1A2B3C4D5E6F' }))
    expect(facts.analyticsEventId).toBe('4D2E6C1A-9F2B-4C3D-8E5F-1A2B3C4D5E6F')
  })

  it.each(['not-a-uuid', '4d2e6c1a9f2b4c3d8e5f1a2b3c4d5e6f', '4d2e6c1a-9f2b-4c3d-8e5f-1a2b3c4d5e6f00', ''])(
    'mints a fresh id when the inbound analytics event id is garbage (%s)',
    (value) => {
      const facts = extractRequestFacts(request({ 'x-kobato-analytics-event': value }))
      expect(facts.analyticsEventId).toMatch(UUID_RE)
      expect(facts.analyticsEventId).not.toBe(value)
    },
  )

  it('extracts every persisted UA Client Hint, high-entropy ones included', () => {
    const facts = extractRequestFacts(
      request({
        'sec-ch-ua': '"Chromium";v="141"',
        'sec-ch-ua-model': 'MacBook Pro',
        'sec-ch-ua-platform': '"macOS"',
        'sec-ch-ua-platform-version': '15.1.0',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-full-version': '141.0.7390.55',
        'sec-ch-ua-full-version-list': '"Chromium";v="141.0.7390.55"',
        'sec-ch-ua-arch': '"arm"',
        'sec-ch-ua-bitness': '64',
        'sec-ch-ua-form-factors': '"Desktop", "Laptop"',
      }),
    )

    expect(facts.clientHints).toEqual({
      model: 'MacBook Pro',
      platform: '"macOS"',
      platformVersion: '15.1.0',
      mobile: '?0',
      brands: '"Chromium";v="141.0.7390.55"',
      fullVersion: '141.0.7390.55',
      arch: '"arm"',
      bitness: '64',
      formFactors: '"Desktop", "Laptop"',
    })
  })

  it('keeps the full Accept-Language header and degrades missing hints to null', () => {
    const facts = extractRequestFacts(request({ 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }))

    expect(facts.acceptLanguage).toBe('zh-CN,zh;q=0.9,en;q=0.8')
    expect(facts.clientHints).toBeNull()
  })

  it('normalizes the documented path and flags data requests', () => {
    const page = extractRequestFacts(request({}, 'https://example.com/posts/x?index&_routes=y'))
    const data = extractRequestFacts(request({}, 'https://example.com/posts/x.data'))

    expect(page.path).toBe('/posts/x')
    expect(page.isDataRequest).toBe(false)
    expect(data.path).toBe('/posts/x')
    expect(data.isDataRequest).toBe(true)
  })
})
