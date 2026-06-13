import { describe, expect, it } from 'vitest'

import { hashLinkHref, isBlock, isInline, numberAttr, stringAttr } from '@/shared/pt/bridge/utils'

describe('shared/pt/bridge/utils — isInline / isBlock', () => {
  it('isInline returns true only for text nodes', () => {
    expect(isInline({ type: 'text', text: 'hi' } as never)).toBe(true)
    expect(isInline({ type: 'paragraph' } as never)).toBe(false)
  })

  it('isBlock returns true for every non-text node', () => {
    expect(isBlock({ type: 'paragraph' } as never)).toBe(true)
    expect(isBlock({ type: 'heading', attrs: { level: 2 } } as never)).toBe(true)
    expect(isBlock({ type: 'text', text: 'hi' } as never)).toBe(false)
  })
})

describe('shared/pt/bridge/utils — stringAttr', () => {
  it('returns the value when attrs has the string key', () => {
    expect(stringAttr({ href: 'x' }, 'href')).toBe('x')
  })

  it('returns undefined for missing or non-string values', () => {
    expect(stringAttr({ href: 42 }, 'href')).toBeUndefined()
    expect(stringAttr({}, 'href')).toBeUndefined()
    expect(stringAttr(undefined, 'href')).toBeUndefined()
  })
})

describe('shared/pt/bridge/utils — numberAttr', () => {
  it('returns the value when attrs has the number key', () => {
    expect(numberAttr({ level: 2 }, 'level')).toBe(2)
  })

  it('returns undefined for missing or non-number values', () => {
    expect(numberAttr({ level: '2' }, 'level')).toBeUndefined()
    expect(numberAttr({}, 'level')).toBeUndefined()
    expect(numberAttr(undefined, 'level')).toBeUndefined()
  })
})

describe('shared/pt/bridge/utils — hashLinkHref', () => {
  it('returns a stable base36 hash for the same input', () => {
    expect(hashLinkHref('https://example.com')).toBe(hashLinkHref('https://example.com'))
  })

  it('produces different hashes for different inputs', () => {
    expect(hashLinkHref('https://a.example')).not.toBe(hashLinkHref('https://b.example'))
  })

  it('returns a non-empty base36 string', () => {
    const h = hashLinkHref('whatever')
    expect(h.length).toBeGreaterThan(0)
    expect(h).toMatch(/^[0-9a-z]+$/)
  })
})
