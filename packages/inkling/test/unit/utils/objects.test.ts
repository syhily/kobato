import { describe, expect, it } from 'vitest'

import { escapeRegExp, kebabCase, pick } from '@/utils/objects'

describe('pick', () => {
  it('picks the requested keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('omits keys that are missing from the object', () => {
    expect(pick({ a: 1 }, ['a', 'b'])).toEqual({ a: 1 })
  })

  it('keeps keys that are present but undefined', () => {
    expect(pick({ a: undefined, b: 2 }, ['a'])).toEqual({ a: undefined })
  })
})

describe('kebabCase', () => {
  it('kebab-cases the draggable data attribute names', () => {
    expect(kebabCase('inklingDndContainer')).toBe('inkling-dnd-container')
    expect(kebabCase('inklingDndDraggable')).toBe('inkling-dnd-draggable')
    expect(kebabCase('inklingDndDroppable')).toBe('inkling-dnd-droppable')
    expect(kebabCase('inklingDndDisabled')).toBe('inkling-dnd-disabled')
  })

  it('handles camelCase, acronyms and underscores', () => {
    expect(kebabCase('FooBar')).toBe('foo-bar')
    expect(kebabCase('__FOO_BAR__')).toBe('foo-bar')
    expect(kebabCase('foo bar')).toBe('foo-bar')
  })
})

describe('escapeRegExp', () => {
  it('escapes the regex special character set', () => {
    expect(escapeRegExp('[example](https://example.com/)')).toBe('\\[example\\]\\(https://example\\.com/\\)')
  })

  it('round-trips through new RegExp to a literal match', () => {
    const literal = 'a+b(c)d^e$f.g|h[i]j{k}\\l?m*n'
    const regex = new RegExp(`^${escapeRegExp(literal)}$`)

    expect(regex.test(literal)).toBe(true)
    expect(regex.test('a+b(c)d^e$f.g|h[i]j{k}\\l?m*no')).toBe(false)
  })
})
