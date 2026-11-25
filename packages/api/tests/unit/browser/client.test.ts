import type { KobatoClientOptions } from '@kobato/api/client/create-client'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const lastOptions = { current: null as KobatoClientOptions | null }

function createKobatoClientMock(options: KobatoClientOptions) {
  lastOptions.current = options
  return { mocked: true }
}

vi.mock('@kobato/api/client/create-client', () => ({
  createKobatoClient: createKobatoClientMock,
}))

function assembledHeaders(): Record<string, string> {
  return (lastOptions.current!.getHeaders as () => Record<string, string>)()
}

describe('browser/client', () => {
  beforeEach(() => {
    vi.resetModules()
    lastOptions.current = null
  })

  it('exports the singleton orpc client assembled through the api factory', async () => {
    const mod = await import('@kobato/api/browser/client')
    expect(mod.orpc).toEqual({ mocked: true })
    expect(lastOptions.current).not.toBeNull()
  })

  it('setCsrfToken causes the assembled headers callback to include X-CSRF-Token', async () => {
    const mod = await import('@kobato/api/browser/client')
    mod.setCsrfToken('test-token')
    expect(assembledHeaders()['X-CSRF-Token']).toBe('test-token')
  })

  it('omits X-CSRF-Token until setCsrfToken runs', async () => {
    await import('@kobato/api/browser/client')
    expect('X-CSRF-Token' in assembledHeaders()).toBe(false)
  })

  it('url falls back to localhost when globalThis.location is undefined', async () => {
    vi.stubGlobal('location', undefined)
    try {
      await import('@kobato/api/browser/client')
      expect((lastOptions.current!.url as () => string)()).toBe('http://localhost/rpc')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('url uses globalThis.location.origin when available', async () => {
    vi.stubGlobal('location', { origin: 'https://example.com' } as Location)
    try {
      await import('@kobato/api/browser/client')
      expect((lastOptions.current!.url as () => string)()).toBe('https://example.com/rpc')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
