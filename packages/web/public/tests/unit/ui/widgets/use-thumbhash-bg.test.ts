import { renderHook } from '@kobato/ui/tests/utils/hook.tsx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const VALID_THUMBHASH_A = 'cucFBwBdaXiMlnV7h/h3toZnxfXGTF8M'
const VALID_THUMBHASH_B = '3AcWDwBnh3d/h3iMeJeHd4h3Z/SoBHAE'

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

  it('returns undefined for a valid thumbhash on first server render', async () => {
    const { useThumbhashBackground } = await importModule()
    const style = renderHook(() => useThumbhashBackground(VALID_THUMBHASH_A))
    expect(style).toBeUndefined()
  })
})

describe('client/hooks/useThumbhashBackground — decoder determinism', () => {
  it('the shared decoder is deterministic for a given thumbhash', async () => {
    const { thumbHashToDataURL } = await import('@kobato/utils/thumbhash.ts')
    const a = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    const b = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    expect(a).toBe(b)
    expect(a).toMatch(/^data:image\/png;base64,/)
  })

  it('the shared decoder produces distinct output for distinct thumbhashes', async () => {
    const { thumbHashToDataURL } = await import('@kobato/utils/thumbhash.ts')
    const a = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_A))
    const b = thumbHashToDataURL(decodeBase64(VALID_THUMBHASH_B))
    expect(a).not.toBe(b)
  })
})

describe('client/hooks/useThumbhashBackground — decode-failure fallback', () => {
  afterEach(() => {
    vi.doUnmock('@kobato/utils/thumbhash.ts')
  })

  it('a throwing decoder does not propagate from the hook (returns undefined)', async () => {
    vi.doMock('@kobato/utils/thumbhash.ts', () => ({
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

async function importModule() {
  return import('@kobato/web-public/ui/widgets/use-thumbhash-bg.ts')
}

function decodeBase64(value: string): Uint8Array {
  const binary = typeof atob === 'function' ? atob(value) : Buffer.from(value, 'base64').toString('binary')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
