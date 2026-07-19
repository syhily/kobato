import { describe, expect, it } from 'vitest'

import { feedHeaders } from '@/server/render/feed/generator'

describe('render/feed/generator — feedHeaders', () => {
  it('emits the RSS content-type and a 30-minute cache window', () => {
    const headers = feedHeaders('rss') as Record<string, string>
    expect(headers['Content-Type']).toBe('application/xml; charset=utf-8')
    expect(headers['Cache-Control']).toBe('public, max-age=1800')
  })

  it('emits the Atom content-type', () => {
    const headers = feedHeaders('atom') as Record<string, string>
    expect(headers['Content-Type']).toBe('application/atom+xml; charset=utf-8')
  })
})
