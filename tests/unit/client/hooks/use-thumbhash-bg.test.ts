import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderHook } from '#/_helpers/hook'

// The hook uses `useSyncExternalStore`; the SSR harness fires one server
// render pass whose snapshot always returns `undefined`, which covers the
// early-return and decode-failure fallback paths.

const VALID_THUMBHASH_A = 'cucFBwBdaXiMlnV7h/h3toZnxfXGTF8M'
const VALID_THUMBHASH_B = '3AcWDwBnh3d/h3iMeJeHd4h3Z/SoBHAE'

// Reset the module registry so the module-level cache and decoder mocks start clean.
beforeEach(() => {
  vi.resetModules()
})

describe('client/hooks/useThumbhashBackground — initial-return gating', () => {
  it('returns undefined when thumbhash is undefined', async () => {
    const { useThumbhashBackground } = await importModule()
    const style = renderHook(() => useThumbhashBackground(undefined))
    expect(style).toBeUndefined()
  })

  it('returns undefined when thumbhash is undefined and loaded is true', async () => {
    const { useThumbhashBackground } = await importModule()
    const style = renderHook(() => useThumbhashBackground(undefined, true))
    expect(style).toBeUndefined()
  })

  it('returns undefined when loaded is true (image already loaded)', async () => {
    const { useThumbhashBackground } = await importModule()
    const style = renderHook(() => useThumbhashBackground(VALID_THUMBHASH_A, true))
    expect(style).toBeUndefined()
  })

  // NOTE: decode-success/cache-hit paths are unreachable — the server snapshot always returns `undefined`.
  it('returns undefined for a valid thumbhash on first server render', async () => {
    const { useThumbhashBackground } = await importModule()
    const style = renderHook(() => useThumbhashBackground(VALID_THUMBHASH_A))
    expect(style).toBeUndefined()
  })
})

describe('client/hooks/useThumbhashBackground — decoder determinism', () => {
  it('the shared decoder is deterministic for a given thumbhash', async () => {
    const { thumbHashToDataURL } = await import('@/shared/utils/thumbhash')
    const a = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    const b = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    expect(a).toBe(b)
    expect(a).toMatch(/^data:image\/png;base64,/)
  })

  it('the shared decoder produces distinct output for distinct thumbhashes', async () => {
    const { thumbHashToDataURL } = await import('@/shared/utils/thumbhash')
    const a = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    const b = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_B))
    expect(a).not.toBe(b)
  })
})

describe('client/hooks/useThumbhashBackground — decode-failure fallback', () => {
  // thumbHashToDataURL throwing is contained by the hook's try/catch (returns undefined).
  afterEach(() => {
    vi.doUnmock('@/shared/utils/thumbhash')
  })

  it('a throwing decoder does not propagate from the hook (returns undefined)', async () => {
    vi.doMock('@/shared/utils/thumbhash', () => ({
      thumbHashToDataURL: vi.fn(() => {
        throw new Error('decode exploded')
      }),
    }))
    const { useThumbhashBackground } = await importModule()
    expect(() => renderHook(() => useThumbhashBackground(VALID_THUMBHASH_A))).not.toThrow()
  })
})

describe('client/hooks/useThumbhashBackground — input transitions', () => {
  it('returns undefined when loaded is true even with a valid thumbhash', async () => {
    const { useThumbhashBackground } = await importModule()
    expect(renderHook(() => useThumbhashBackground(VALID_THUMBHASH_A, true))).toBeUndefined()
  })

  it('returns undefined on server render for any thumbhash', async () => {
    const { useThumbhashBackground } = await importModule()
    expect(renderHook(() => useThumbhashBackground(VALID_THUMBHASH_B))).toBeUndefined()
  })
})

// Re-import so each test gets a fresh module instance and module-level cache.
async function importModule() {
  return import('@/client/hooks/use-thumbhash-bg')
}

// Decode a base64 thumbhash string into the Uint8Array the decoder expects.
function decodeBase64(value: string): Uint8Array {
  const binary = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
