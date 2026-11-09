import { renderHook, waitFor } from '@testing-library/react'
// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import {
  __isDevRumModuleRequestedForTests,
  __resetDevRumHookForTests,
  isDevRumDenied,
  useDevRum,
} from '@/client/hooks/use-dev-rum'

const rum = vi.hoisted(() => ({
  startDevRum: vi.fn(async () => {}),
  stopDevRum: vi.fn(),
  suspendDevRum: vi.fn(),
}))

const matches = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }))

vi.mock('react-router', () => ({
  useMatches: () => matches.current,
}))

vi.mock('@/client/lib/openobserve-rum', () => ({
  startDevRum: rum.startDevRum,
  stopDevRum: rum.stopDevRum,
  suspendDevRum: rum.suspendDevRum,
}))

const BOOTSTRAP: FrontendRumBootstrap = {
  site: 'http://127.0.0.1:5080',
  organization: 'default',
  applicationId: 'kobato-dev',
  clientToken: 'rum-client-token',
  service: 'kobato',
  environment: 'development',
  sessionSampleRate: 100,
}

function stubPolicy(options: { dnt?: string | null; gpc?: boolean } = {}): void {
  Object.defineProperty(window.navigator, 'doNotTrack', {
    configurable: true,
    value: options.dnt ?? null,
  })
  Object.defineProperty(window.navigator, 'globalPrivacyControl', {
    configurable: true,
    value: options.gpc ?? false,
  })
}

beforeEach(() => {
  __resetDevRumHookForTests()
  rum.startDevRum.mockClear()
  rum.stopDevRum.mockClear()
  rum.suspendDevRum.mockClear()
  matches.current = [
    { id: 'root', pathname: '/' },
    { id: 'routes/public/post/detail', pathname: '/posts/secret-slug', params: { slug: 'secret-slug' } },
  ]
  stubPolicy()
})

afterEach(() => {
  __resetDevRumHookForTests()
  vi.unstubAllGlobals()
})

describe('isDevRumDenied', () => {
  it('honors DNT=1 and GPC=true, and allows an absent policy', () => {
    expect(isDevRumDenied({ doNotTrack: '1' } as Navigator)).toBe(true)
    expect(isDevRumDenied({ doNotTrack: '0' } as Navigator)).toBe(false)
    expect(isDevRumDenied({ doNotTrack: null, globalPrivacyControl: true } as unknown as Navigator)).toBe(true)
    expect(isDevRumDenied({ doNotTrack: null, globalPrivacyControl: false } as unknown as Navigator)).toBe(false)
    expect(isDevRumDenied(undefined)).toBe(false)
  })
})

describe('useDevRum', () => {
  it('does not even request the SDK chunk when the bootstrap is absent', () => {
    renderHook(() => useDevRum(null))

    expect(__isDevRumModuleRequestedForTests()).toBe(false)
    expect(rum.startDevRum).not.toHaveBeenCalled()
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk when DNT=1', async () => {
    stubPolicy({ dnt: '1' })
    renderHook(() => useDevRum(BOOTSTRAP))

    await Promise.resolve()
    expect(__isDevRumModuleRequestedForTests()).toBe(false)
    expect(rum.startDevRum).not.toHaveBeenCalled()
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk when GPC=true', async () => {
    stubPolicy({ gpc: true })
    renderHook(() => useDevRum(BOOTSTRAP))

    await Promise.resolve()
    expect(__isDevRumModuleRequestedForTests()).toBe(false)
    expect(rum.startDevRum).not.toHaveBeenCalled()
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk for a malformed bootstrap', async () => {
    renderHook(() => useDevRum({ ...BOOTSTRAP, applicationId: '' }))

    await Promise.resolve()
    expect(__isDevRumModuleRequestedForTests()).toBe(false)
    expect(rum.startDevRum).not.toHaveBeenCalled()
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('starts once with the route identity and no raw URL/params', async () => {
    renderHook(() => useDevRum(BOOTSTRAP))

    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())
    expect(rum.startDevRum).toHaveBeenCalledWith(BOOTSTRAP, {
      id: 'routes/public/post/detail',
      template: '/posts/:slug',
    })
    const serialized = JSON.stringify(rum.startDevRum.mock.calls[0])
    expect(serialized).not.toContain('secret-slug')
  })

  it('initializes once under StrictMode double effects without revoking consent', async () => {
    renderHook(() => useDevRum(BOOTSTRAP), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })

    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())
    expect(__isDevRumModuleRequestedForTests()).toBe(true)
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('suspends (not stops) when an active bootstrap becomes null, and resumes when it returns', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useDevRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: null })
    await waitFor(() => expect(rum.suspendDevRum).toHaveBeenCalledOnce())
    expect(rum.stopDevRum).not.toHaveBeenCalled()

    rerender({ bootstrap: BOOTSTRAP })
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledTimes(2))
    expect(rum.stopDevRum).not.toHaveBeenCalled()
  })

  it('fully stops on unmount after a suspend', async () => {
    const { rerender, unmount } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useDevRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: null })
    await waitFor(() => expect(rum.suspendDevRum).toHaveBeenCalledOnce())
    expect(rum.stopDevRum).not.toHaveBeenCalled()

    unmount()
    await waitFor(() => expect(rum.stopDevRum).toHaveBeenCalledOnce())
  })

  it('fully stops (not suspends) when DNT turns on after an active start', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useDevRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    stubPolicy({ dnt: '1' })
    rerender({ bootstrap: BOOTSTRAP })

    await waitFor(() => expect(rum.stopDevRum).toHaveBeenCalledOnce())
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
    expect(rum.startDevRum).toHaveBeenCalledOnce()
  })

  it('fully stops when the bootstrap becomes invalid', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useDevRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: { ...BOOTSTRAP, clientToken: '' } as FrontendRumBootstrap })

    await waitFor(() => expect(rum.stopDevRum).toHaveBeenCalledOnce())
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
    expect(rum.startDevRum).toHaveBeenCalledOnce()
  })

  it('does not revoke or suspend on a valid route change', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useDevRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    matches.current = [{ id: 'routes/public/home', pathname: '/' }]
    rerender({ bootstrap: BOOTSTRAP })

    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledTimes(2))
    expect(rum.startDevRum).toHaveBeenLastCalledWith(BOOTSTRAP, { id: 'routes/public/home', template: '/' })
    expect(rum.stopDevRum).not.toHaveBeenCalled()
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })

  it('revokes consent on a real unmount (no following valid effect)', async () => {
    const { unmount } = renderHook(() => useDevRum(BOOTSTRAP))
    await waitFor(() => expect(rum.startDevRum).toHaveBeenCalledOnce())

    unmount()

    await waitFor(() => expect(rum.stopDevRum).toHaveBeenCalledOnce())
    expect(rum.suspendDevRum).not.toHaveBeenCalled()
  })
})
