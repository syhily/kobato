import { describe, expect, it } from 'vitest'

import { isChunkLoadError } from '@/shared/utils/chunk-error'

// Contract test: locks the cross-browser chunk-error strings — false
// negatives silently crash a stale tab, false positives force reload loops.

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
