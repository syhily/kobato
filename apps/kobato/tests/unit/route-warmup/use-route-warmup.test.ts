// @vitest-environment happy-dom

import type { WarmupManifest } from '@kobato/distribution/warmup-manifest'

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetRouteWarmupForTests, useRouteWarmup } from '@/route-warmup/use-route-warmup'

const MANIFEST: WarmupManifest = {
  version: 1,
  tier1: ['/assets/t1-a.js', '/assets/t1-b.js'],
  tier2_public: [],
  tier2_admin: ['/assets/admin-a.js'],
  tier2_editor: ['/assets/editor-a.js'],
  tier2_auth: ['/assets/auth-a.js'],
}

function stubFetchManifest(manifest: WarmupManifest | null): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => ({
    ok: manifest !== null,
    json: async () => manifest ?? {},
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function preloadedHrefs(): string[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')]
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => href !== null)
}

async function warm(admin: boolean, pathname: string): Promise<void> {
  renderHook(() => useRouteWarmup({ admin, pathname }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

async function idle(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000)
  })
}

describe('useRouteWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    __resetRouteWarmupForTests()
    document.head.replaceChildren()
  })

  it('issues no request in dev', async () => {
    vi.stubEnv('DEV', true as never)
    const fetchMock = stubFetchManifest(MANIFEST)
    await warm(true, '/admin')
    await idle()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(preloadedHrefs()).toEqual([])
  })

  it('fetches the manifest once per document', async () => {
    vi.stubEnv('DEV', false as never)
    const fetchMock = stubFetchManifest(MANIFEST)
    const view = renderHook(
      ({ admin, pathname }: { admin: boolean; pathname: string }) => useRouteWarmup({ admin, pathname }),
      { initialProps: { admin: false, pathname: '/admin/signin' } },
    )
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(3000)
    })
    view.rerender({ admin: false, pathname: '/admin' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    view.rerender({ admin: true, pathname: '/admin/security/users' })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('warms only tier1 immediately and the role tier at idle for a non-admin', async () => {
    vi.stubEnv('DEV', false as never)
    stubFetchManifest(MANIFEST)
    await warm(false, '/admin/signin')
    expect(preloadedHrefs().sort()).toEqual(['/assets/t1-a.js', '/assets/t1-b.js'])
    await idle()
    expect(preloadedHrefs().sort()).toEqual(['/assets/auth-a.js', '/assets/t1-a.js', '/assets/t1-b.js'])
  })

  it('warms the admin and editor tiers for an admin', async () => {
    vi.stubEnv('DEV', false as never)
    stubFetchManifest(MANIFEST)
    await warm(true, '/admin/dashboard')
    await idle()
    expect(preloadedHrefs().sort()).toEqual([
      '/assets/admin-a.js',
      '/assets/auth-a.js',
      '/assets/editor-a.js',
      '/assets/t1-a.js',
      '/assets/t1-b.js',
    ])
  })

  it('skips chunks the document already preloads and never duplicates an injected link', async () => {
    vi.stubEnv('DEV', false as never)
    const existing = document.createElement('link')
    existing.rel = 'modulepreload'
    existing.href = '/assets/t1-a.js'
    document.head.appendChild(existing)
    stubFetchManifest(MANIFEST)
    await warm(true, '/admin')
    await idle()
    await warm(true, '/admin/posts')
    await idle()
    const hrefs = preloadedHrefs()
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(hrefs.sort()).toEqual([
      '/assets/admin-a.js',
      '/assets/auth-a.js',
      '/assets/editor-a.js',
      '/assets/t1-a.js',
      '/assets/t1-b.js',
    ])
  })

  it('does nothing when the manifest cannot be fetched and never retries', async () => {
    vi.stubEnv('DEV', false as never)
    const fetchMock = stubFetchManifest(null)
    await warm(true, '/admin')
    await idle()
    await warm(false, '/admin/signin')
    await idle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(preloadedHrefs()).toEqual([])
  })
})
