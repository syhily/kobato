import { describe, expect, it } from 'vitest'

import { clsx } from '@/ui/lib/clsx'

// Helpers to avoid oxlint no-constant-binary-expression on test inputs.
function b(v: boolean): boolean {
  return v
}
function n(v: number): number {
  return v
}
function noop(): void {
  // intentionally empty for test
}

describe('clsx', () => {
  it('returns string for empty input', () => {
    expect(clsx()).toBe('')
    expect(typeof clsx()).toBe('string')
  })

  it('handles strings', () => {
    expect(clsx('')).toBe('')
    expect(clsx('foo')).toBe('foo')
    expect(clsx(b(true) && 'foo')).toBe('foo')
    expect(clsx(b(false) && 'foo')).toBe('')
  })

  it('handles strings (variadic)', () => {
    expect(clsx('')).toBe('')
    expect(clsx('foo', 'bar')).toBe('foo bar')
    expect(clsx(b(true) && 'foo', b(false) && 'bar', 'baz')).toBe('foo baz')
    expect(clsx(b(false) && 'foo', 'bar', 'baz', '')).toBe('bar baz')
  })

  it('handles numbers', () => {
    expect(clsx(1)).toBe('1')
    expect(clsx(12)).toBe('12')
    expect(clsx(0.1)).toBe('0.1')
    expect(clsx(0)).toBe('')
    expect(clsx(Infinity)).toBe('Infinity')
    expect(clsx(NaN)).toBe('')
  })

  it('handles numbers (variadic)', () => {
    expect(clsx(0, 1)).toBe('1')
    expect(clsx(1, 2)).toBe('1 2')
  })

  it('handles objects', () => {
    expect(clsx({})).toBe('')
    expect(clsx({ foo: true })).toBe('foo')
    expect(clsx({ foo: true, bar: false })).toBe('foo')
    expect(clsx({ foo: 'hiya', bar: 1 })).toBe('foo bar')
    expect(clsx({ foo: 1, bar: 0, baz: 1 })).toBe('foo baz')
    expect(clsx({ '-foo': 1, '--bar': 1 })).toBe('-foo --bar')
  })

  it('handles objects (variadic)', () => {
    expect(clsx({}, {})).toBe('')
    expect(clsx({ foo: 1 }, { bar: 2 })).toBe('foo bar')
    expect(clsx({ foo: 1 }, null, { baz: 1, bat: 0 })).toBe('foo baz')
    expect(clsx({ foo: 1 }, {}, {}, { bar: 'a' }, { baz: null, bat: Infinity })).toBe('foo bar bat')
  })

  it('handles arrays', () => {
    expect(clsx([])).toBe('')
    expect(clsx(['foo'])).toBe('foo')
    expect(clsx(['foo', 'bar'])).toBe('foo bar')
    expect(clsx(['foo', n(0) && 'bar', n(1) && 'baz'])).toBe('foo baz')
  })

  it('handles nested arrays', () => {
    expect(clsx([[[]]])).toBe('')
    expect(clsx([[['foo']]])).toBe('foo')
    expect(clsx([b(true), [['foo']]])).toBe('foo')
    expect(clsx(['foo', ['bar', ['', [['baz']]]]])).toBe('foo bar baz')
  })

  it('handles arrays (variadic)', () => {
    expect(clsx([], [])).toBe('')
    expect(clsx(['foo'], ['bar'])).toBe('foo bar')
    expect(clsx(['foo'], null, ['baz', ''], b(true), '', [])).toBe('foo baz')
  })

  it('does not treat built-in array methods as keys', () => {
    expect(clsx({ push: 1 })).toBe('push')
    expect(clsx({ pop: true })).toBe('pop')
    expect(clsx({ push: true })).toBe('push')
    expect(clsx('hello', { world: 1, push: true })).toBe('hello world push')
  })

  it('ignores functions', () => {
    expect(clsx(noop, 'hello')).toBe('hello')
    expect(clsx(noop, 'hello', noop)).toBe('hello')
    expect(clsx(noop, 'hello', [[noop], 'world'])).toBe('hello world')
  })
})
