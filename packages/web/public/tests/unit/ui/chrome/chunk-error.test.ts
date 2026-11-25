import { isChunkLoadError } from '@kobato/web-public/ui/chrome/chunk-error'
import { describe, expect, it } from 'vitest'

describe('isChunkLoadError', () => {
  it('matches Chrome / Edge dynamic import failures', () => {
    const err = new TypeError('Failed to fetch dynamically imported module: https://example.com/assets/abc.js')
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches Firefox dynamic import failures', () => {
    const err = new TypeError('error loading dynamically imported module: https://example.com/assets/abc.js')
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches Safari / WebKit dynamic import failures', () => {
    const err = new TypeError('Importing a module script failed.')
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches webpack-style ChunkLoadError by name', () => {
    const err = new Error('Loading chunk 42 failed.')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches webpack-style chunk failures by message', () => {
    const err = new Error('Loading chunk 17 failed at https://example.com/...')
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches CSS chunk failures', () => {
    const err = new Error('Loading CSS chunk 9 failed.')
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches a bare string reason (unhandledrejection edge case)', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: x.js')).toBe(true)
  })

  it('rejects unrelated TypeErrors', () => {
    expect(isChunkLoadError(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })

  it('rejects unrelated Errors', () => {
    expect(isChunkLoadError(new Error('Network request failed'))).toBe(false)
  })

  it('rejects null / undefined / non-objects', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError(42)).toBe(false)
    expect(isChunkLoadError({})).toBe(false)
  })
})

describe('isChunkLoadError — shape and message guards', () => {
  it('returns false for null / undefined', () => {
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })

  it('returns false for non-string, non-object primitives', () => {
    expect(isChunkLoadError(123)).toBe(false)
    expect(isChunkLoadError(true)).toBe(false)
  })

  it('matches a known message needle (case-insensitive)', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module: x')).toBe(true)
    expect(isChunkLoadError('ERROR LOADING DYNAMICALLY IMPORTED MODULE')).toBe(true)
    expect(isChunkLoadError('Importing a module script failed.')).toBe(true)
    expect(isChunkLoadError('Loading CSS chunk 5 failed.')).toBe(true)
  })

  it('matches the "loading chunk ... failed" compound message', () => {
    expect(isChunkLoadError('Loading chunk 12 failed.')).toBe(true)
    expect(isChunkLoadError('loading chunk foo failed')).toBe(true)
  })

  it('does not match an unrelated message', () => {
    expect(isChunkLoadError('something else went wrong')).toBe(false)
    expect(isChunkLoadError('loading chunk 5')).toBe(false)
    expect(isChunkLoadError('failed to load')).toBe(false)
  })

  it('matches an Error object with name === ChunkLoadError', () => {
    const err = new Error('boom')
    err.name = 'ChunkLoadError'
    expect(isChunkLoadError(err)).toBe(true)
  })

  it('matches an Error object whose message contains a needle', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module'))).toBe(true)
  })

  it('returns false for an object without name or message', () => {
    expect(isChunkLoadError({})).toBe(false)
    expect(isChunkLoadError({ name: 123 })).toBe(false)
    expect(isChunkLoadError({ message: 123 })).toBe(false)
  })
})
