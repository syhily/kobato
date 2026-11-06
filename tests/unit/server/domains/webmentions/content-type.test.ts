import { describe, expect, it } from 'vitest'

import { isHtmlContentType } from '@/server/domains/webmentions/content-type'

describe('webmentions / html content-type gate', () => {
  it('accepts both HTML media types, with or without parameters', () => {
    expect(isHtmlContentType('text/html')).toBe(true)
    expect(isHtmlContentType('text/html; charset=UTF-8')).toBe(true)
    expect(isHtmlContentType('TEXT/HTML;charset=utf-8')).toBe(true)
    expect(isHtmlContentType('application/xhtml+xml')).toBe(true)
    expect(isHtmlContentType('application/xhtml+xml; charset=utf-8')).toBe(true)
  })

  it('accepts a missing or empty header (some static servers omit it)', () => {
    expect(isHtmlContentType(null)).toBe(true)
    expect(isHtmlContentType(undefined)).toBe(true)
    expect(isHtmlContentType('')).toBe(true)
    expect(isHtmlContentType('   ')).toBe(true)
  })

  it('rejects every other declared media type', () => {
    expect(isHtmlContentType('text/plain')).toBe(false)
    expect(isHtmlContentType('application/json')).toBe(false)
    expect(isHtmlContentType('image/png')).toBe(false)
    expect(isHtmlContentType('application/octet-stream')).toBe(false)
    expect(isHtmlContentType('text/htmlx')).toBe(false)
  })
})
