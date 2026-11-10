import { renderHook, waitFor } from '@testing-library/react'
// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { __isRumModuleRequestedForTests, __resetRumHookForTests, isRumDenied, useRum } from '@/client/hooks/use-rum'

const rum = vi.hoisted(() => ({
  startRum: vi.fn(async () => {}),
  stopRum: vi.fn(),
  suspendRum: vi.fn(),
}))

const matches = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }))

vi.mock('react-router', () => ({
  useMatches: () => matches.current,
}))

vi.mock('@/client/lib/openobserve-rum', () => ({
  startRum: rum.startRum,
  stopRum: rum.stopRum,
  suspendRum: rum.suspendRum,
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
  __resetRumHookForTests()
  rum.startRum.mockClear()
  rum.stopRum.mockClear()
  rum.suspendRum.mockClear()
  matches.current = [
    { id: 'root', pathname: '/' },
    { id: 'routes/public/post/detail', pathname: '/posts/secret-slug', params: { slug: 'secret-slug' } },
  ]
  stubPolicy()
})

afterEach(() => {
  __resetRumHookForTests()
  vi.unstubAllGlobals()
})

describe('isRumDenied', () => {
  it('honors DNT=1 and GPC=true, and allows an absent policy', () => {
    expect(isRumDenied({ doNotTrack: '1' } as Navigator)).toBe(true)
    expect(isRumDenied({ doNotTrack: '0' } as Navigator)).toBe(false)
    expect(isRumDenied({ doNotTrack: null, globalPrivacyControl: true } as unknown as Navigator)).toBe(true)
    expect(isRumDenied({ doNotTrack: null, globalPrivacyControl: false } as unknown as Navigator)).toBe(false)
    expect(isRumDenied(undefined)).toBe(false)
  })
})

describe('useRum', () => {
  it('does not even request the SDK chunk when the bootstrap is absent', () => {
    renderHook(() => useRum(null))

    expect(__isRumModuleRequestedForTests()).toBe(false)
    expect(rum.startRum).not.toHaveBeenCalled()
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk when DNT=1', async () => {
    stubPolicy({ dnt: '1' })
    renderHook(() => useRum(BOOTSTRAP))

    await Promise.resolve()
    expect(__isRumModuleRequestedForTests()).toBe(false)
    expect(rum.startRum).not.toHaveBeenCalled()
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk when GPC=true', async () => {
    stubPolicy({ gpc: true })
    renderHook(() => useRum(BOOTSTRAP))

    await Promise.resolve()
    expect(__isRumModuleRequestedForTests()).toBe(false)
    expect(rum.startRum).not.toHaveBeenCalled()
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('does not request the SDK chunk for a malformed bootstrap', async () => {
    renderHook(() => useRum({ ...BOOTSTRAP, applicationId: '' }))

    await Promise.resolve()
    expect(__isRumModuleRequestedForTests()).toBe(false)
    expect(rum.startRum).not.toHaveBeenCalled()
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('starts once with the route identity and no raw URL/params', async () => {
    renderHook(() => useRum(BOOTSTRAP))

    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())
    expect(rum.startRum).toHaveBeenCalledWith(BOOTSTRAP, {
      id: 'routes/public/post/detail',
      template: '/posts/:slug',
    })
    const serialized = JSON.stringify(rum.startRum.mock.calls[0])
    expect(serialized).not.toContain('secret-slug')
  })

  it('starts from a production-labelled bootstrap — there is no build gate left', async () => {
    const production = { ...BOOTSTRAP, environment: 'production' as const }
    renderHook(() => useRum(production))

    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())
    expect(rum.startRum).toHaveBeenCalledWith(production, {
      id: 'routes/public/post/detail',
      template: '/posts/:slug',
    })
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('initializes once under StrictMode double effects without revoking consent', async () => {
    renderHook(() => useRum(BOOTSTRAP), {
      wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
    })

    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())
    expect(__isRumModuleRequestedForTests()).toBe(true)
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('suspends (not stops) when an active bootstrap becomes null, and resumes when it returns', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: null })
    await waitFor(() => expect(rum.suspendRum).toHaveBeenCalledOnce())
    expect(rum.stopRum).not.toHaveBeenCalled()

    rerender({ bootstrap: BOOTSTRAP })
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledTimes(2))
    expect(rum.stopRum).not.toHaveBeenCalled()
  })

  it('fully stops on unmount after a suspend', async () => {
    const { rerender, unmount } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: null })
    await waitFor(() => expect(rum.suspendRum).toHaveBeenCalledOnce())
    expect(rum.stopRum).not.toHaveBeenCalled()

    unmount()
    await waitFor(() => expect(rum.stopRum).toHaveBeenCalledOnce())
  })

  it('fully stops (not suspends) when DNT turns on after an active start', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    stubPolicy({ dnt: '1' })
    rerender({ bootstrap: BOOTSTRAP })

    await waitFor(() => expect(rum.stopRum).toHaveBeenCalledOnce())
    expect(rum.suspendRum).not.toHaveBeenCalled()
    expect(rum.startRum).toHaveBeenCalledOnce()
  })

  it('fully stops when the bootstrap becomes invalid', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    rerender({ bootstrap: { ...BOOTSTRAP, clientToken: '' } as FrontendRumBootstrap })

    await waitFor(() => expect(rum.stopRum).toHaveBeenCalledOnce())
    expect(rum.suspendRum).not.toHaveBeenCalled()
    expect(rum.startRum).toHaveBeenCalledOnce()
  })

  it('does not revoke or suspend on a valid route change', async () => {
    const { rerender } = renderHook<unknown, { bootstrap: FrontendRumBootstrap | null }>(
      ({ bootstrap }) => useRum(bootstrap),
      { initialProps: { bootstrap: BOOTSTRAP } },
    )
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    matches.current = [{ id: 'routes/public/home', pathname: '/' }]
    rerender({ bootstrap: BOOTSTRAP })

    await waitFor(() => expect(rum.startRum).toHaveBeenCalledTimes(2))
    expect(rum.startRum).toHaveBeenLastCalledWith(BOOTSTRAP, { id: 'routes/public/home', template: '/' })
    expect(rum.stopRum).not.toHaveBeenCalled()
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })

  it('revokes consent on a real unmount (no following valid effect)', async () => {
    const { unmount } = renderHook(() => useRum(BOOTSTRAP))
    await waitFor(() => expect(rum.startRum).toHaveBeenCalledOnce())

    unmount()

    await waitFor(() => expect(rum.stopRum).toHaveBeenCalledOnce())
    expect(rum.suspendRum).not.toHaveBeenCalled()
  })
})
