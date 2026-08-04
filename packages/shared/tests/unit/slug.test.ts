import { Slugger } from '@kobato/shared/slug'
import { describe, expect, it } from 'vitest'

describe('Slugger', () => {
  it('lower-cases and replaces whitespace with dashes', () => {
    const slugger = new Slugger()
    expect(slugger.slug('Hello World')).toBe('hello-world')
  })

  it('strips punctuation', () => {
    const slugger = new Slugger()
    expect(slugger.slug('a.b.c')).toBe('abc')
    expect(slugger.slug('Hello, World!')).toBe('hello-world')
  })

  it('preserves dashes', () => {
    const slugger = new Slugger()
    expect(slugger.slug('foo-bar')).toBe('foo-bar')
  })

  it('handles Unicode letters and numbers', () => {
    const slugger = new Slugger()
    expect(slugger.slug('编程')).toBe('编程')
    expect(slugger.slug('hello世界')).toBe('hello世界')
  })

  it('returns empty string for emoji-only input', () => {
    const slugger = new Slugger()
    expect(slugger.slug('💯')).toBe('')
  })

  it('deduplicates slugs within the same instance', () => {
    const slugger = new Slugger()
    expect(slugger.slug('foo')).toBe('foo')
    expect(slugger.slug('foo')).toBe('foo-1')
    expect(slugger.slug('foo')).toBe('foo-2')
  })

  it('does not deduplicate across separate instances', () => {
    const a = new Slugger()
    const b = new Slugger()
    expect(a.slug('bar')).toBe('bar')
    expect(b.slug('bar')).toBe('bar')
  })

  it('resets dedup counter for distinct bases', () => {
    const slugger = new Slugger()
    expect(slugger.slug('foo')).toBe('foo')
    expect(slugger.slug('bar')).toBe('bar')
    expect(slugger.slug('foo')).toBe('foo-1')
  })

  it('trims leading and trailing whitespace', () => {
    const slugger = new Slugger()
    expect(slugger.slug('  hello  ')).toBe('hello')
  })
})
