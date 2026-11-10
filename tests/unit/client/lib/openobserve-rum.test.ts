// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FrontendRumBootstrap } from '@/shared/contracts/trace'

import { makeResourceEvent, makeViewEvent, RUM_TEST_SESSION_ID, RUM_TEST_TRACE_ID } from '#/_helpers/rum-events'
import {
  __pollRumStatusForTests,
  __resetRumForTests,
  rumIntakeProxyUrl,
  startRum,
  stopRum,
  suspendRum,
} from '@/client/lib/openobserve-rum'
import { isSelfTelemetryRumUrl, isTraceableRumUrl } from '@/client/lib/rum-url-policy'
import { APP_VERSION } from '@/shared/config/version'

const sdk = vi.hoisted(() => ({
  init: vi.fn<(configuration: Record<string, any>) => void>(),
  setViewName: vi.fn<(name: string) => void>(),
  setTrackingConsent: vi.fn<(consent: 'granted' | 'not-granted') => void>(),
  startView: vi.fn<(nameOrOptions?: string | { name?: string }) => void>(),
  stopSession: vi.fn<() => void>(),
}))

vi.mock('@openobserve/browser-rum-slim', () => ({
  openobserveRum: {
    init: sdk.init,
    setViewName: sdk.setViewName,
    setTrackingConsent: sdk.setTrackingConsent,
    startView: sdk.startView,
    stopSession: sdk.stopSession,
    version: '0.4.3',
  },
  DefaultPrivacyLevel: { ALLOW: 'allow', MASK: 'mask', MASK_USER_INPUT: 'mask-user-input' },
}))

const ROUTE = { id: 'routes/public/post/detail', template: '/posts/:slug' }

const BOOTSTRAP: FrontendRumBootstrap = {
  applicationId: 'kobato-dev',
  service: 'kobato',
  environment: 'development',
  sessionSampleRate: 25,
  clientIdentity: 'anonymous',
}

function initConfiguration(): Record<string, any> {
  expect(sdk.init).toHaveBeenCalledOnce()
  return sdk.init.mock.calls[0]![0]
}

beforeEach(() => {
  Object.defineProperty(window.navigator, 'doNotTrack', { configurable: true, value: null })
  globalThis.sessionStorage.clear()
  __resetRumForTests()
  sdk.init.mockReset()
  sdk.setViewName.mockReset()
  sdk.setTrackingConsent.mockReset()
  sdk.startView.mockReset()
  sdk.stopSession.mockReset()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
  )
})

afterEach(() => {
  __resetRumForTests()
  vi.unstubAllGlobals()
})

describe('startRum initialization', () => {
  it('maps the bootstrap onto the real slim SDK configuration', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    const configuration = initConfiguration()

    expect(configuration).toMatchObject({
      applicationId: 'kobato-dev',
      // The placeholder token never leaves the same-origin relay.
      clientToken: 'kobato-relay',
      service: 'kobato',
      env: 'development',
      version: APP_VERSION,
      sessionSampleRate: 25,
      telemetrySampleRate: 0,
      telemetryConfigurationSampleRate: 0,
      telemetryUsageSampleRate: 0,
      sessionReplaySampleRate: 0,
      startSessionReplayRecordingManually: true,
      defaultPrivacyLevel: 'mask',
      trackResources: true,
      trackLongTasks: true,
      trackUserInteractions: false,
      trackAnonymousUser: false,
      trackResourceHeaders: false,
      propagateTraceBaggage: false,
      compressIntakeRequests: false,
      profilingSampleRate: 0,
      silentMultipleInit: true,
      traceSampleRate: 100,
      traceContextInjection: 'sampled',
    })
    expect(configuration.proxy).toBe(rumIntakeProxyUrl)
    // The browser learns neither the OpenObserve endpoint nor the organization.
    expect(configuration).not.toHaveProperty('site')
    expect(configuration).not.toHaveProperty('insecureHTTP')
    expect(configuration).not.toHaveProperty('organizationIdentifier')
    expect(configuration).not.toHaveProperty('workerUrl')
    expect(configuration).not.toHaveProperty('setUser')
    expect(sdk.setViewName).toHaveBeenCalledWith('routes/public/post/detail')
  })

  it('builds the same-origin intake URL from the SDK path and parameters', () => {
    expect(rumIntakeProxyUrl({ path: '/rum/v1/default/rum', parameters: 'o2-api-key=kobato-relay&batch_time=1' })).toBe(
      `${globalThis.location.origin}/api/rum/intake/rum/v1/default/rum?o2-api-key=kobato-relay&batch_time=1`,
    )
  })

  it('never puts the server OTLP credential into the browser configuration', async () => {
    const secret = 'Basic c2VydmVyLXNlY3JldA=='
    const bootstrap = { ...BOOTSTRAP, serverAuthorizationHeader: secret } as unknown as FrontendRumBootstrap

    await startRum(bootstrap, ROUTE)
    const configuration = initConfiguration()

    expect(configuration).not.toHaveProperty('serverAuthorizationHeader')
    expect(configuration).not.toHaveProperty('authorizationHeader')
    expect(JSON.stringify(configuration)).not.toContain(secret)
  })

  it('is idempotent: a second start does not re-init but updates the view', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    await startRum(BOOTSTRAP, { id: 'routes/public/home', template: '/' })

    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.setViewName).toHaveBeenLastCalledWith('routes/public/home')
  })

  it('restores the per-session event budget after a page reload', async () => {
    globalThis.sessionStorage.setItem(
      'kobato.rum.budget',
      JSON.stringify({ sessionId: RUM_TEST_SESSION_ID, resources: 500, errors: 0 }),
    )

    await startRum(BOOTSTRAP, ROUTE)
    const { beforeSend } = initConfiguration()

    expect(beforeSend(makeResourceEvent({ url: 'http://localhost:3000/rpc/content/home' }), {})).toBe(false)

    const nextSession = makeResourceEvent(
      { url: 'http://localhost:3000/rpc/content/home' },
      { session: { id: '018f2b6c-7d4e-7a3b-9c1d-000000000003', type: 'user' } },
    )
    expect(beforeSend(nextSession, {})).toBe(true)
  })

  it('survives an HMR module re-evaluation without re-initializing', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    vi.resetModules()
    const reloaded = await import('@/client/lib/openobserve-rum')
    await reloaded.startRum(BOOTSTRAP, { id: 'routes/public/home', template: '/' })

    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.setViewName).toHaveBeenLastCalledWith('routes/public/home')
  })

  it('suspend keeps the SDK/route/poll and gate recovery resumes the current view', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    await Promise.resolve()

    suspendRum()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    expect(sdk.stopSession).toHaveBeenCalledOnce()
    expect(sdk.startView).not.toHaveBeenCalled()

    const state = Reflect.get(globalThis, Symbol.for('kobato.rum.runtime')) as Record<string, unknown>
    expect(state.status).toBe('started')
    expect(state.api).not.toBeNull()
    expect(state.pollTimer).not.toBeNull()
    expect(state.route).toEqual(ROUTE)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    )
    await __pollRumStatusForTests()

    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('granted')
    expect(sdk.startView).toHaveBeenLastCalledWith(ROUTE.id)
    expect(sdk.init).toHaveBeenCalledOnce()
  })

  it('revokes consent on an explicit stop, is idempotent, and can re-init after it', async () => {
    await startRum(BOOTSTRAP, ROUTE)

    stopRum()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    const callsAfterStop = sdk.setTrackingConsent.mock.calls.length

    stopRum()
    expect(sdk.setTrackingConsent).toHaveBeenCalledTimes(callsAfterStop)

    await startRum(BOOTSTRAP, ROUTE)
    expect(sdk.init).toHaveBeenCalledTimes(2)
    expect(sdk.init.mock.calls[1]![0]).toMatchObject({ trackingConsent: 'granted' })
  })

  it('honors a suspend that arrives while initialization is still in flight', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })),
    )
    const starting = startRum(BOOTSTRAP, ROUTE)
    suspendRum()
    await starting

    expect(sdk.init.mock.calls[0]![0]).toMatchObject({ trackingConsent: 'not-granted' })
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    const state = Reflect.get(globalThis, Symbol.for('kobato.rum.runtime')) as Record<string, unknown>
    expect(state.status).toBe('started')
    expect(state.consent).toBe('not-granted')
  })

  it('aborts an in-flight initialization when the SDK is fully stopped', async () => {
    const starting = startRum(BOOTSTRAP, ROUTE)
    stopRum()
    await starting

    expect(sdk.init).not.toHaveBeenCalled()
    const state = Reflect.get(globalThis, Symbol.for('kobato.rum.runtime')) as Record<string, unknown>
    expect(state.status).toBe('idle')
  })

  it('contains an init failure and never retries it in the same page', async () => {
    sdk.init.mockImplementationOnce(() => {
      throw new Error('sdk init failed')
    })

    await expect(startRum(BOOTSTRAP, ROUTE)).resolves.toBeUndefined()
    await expect(startRum(BOOTSTRAP, ROUTE)).resolves.toBeUndefined()

    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.setViewName).not.toHaveBeenCalled()
  })
})

describe('runtime status polling', () => {
  it('stops on false, resumes the current view with startView on true', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    expect(sdk.stopSession).toHaveBeenCalledOnce()
    expect(sdk.startView).not.toHaveBeenCalled()

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('granted')
    expect(sdk.startView).toHaveBeenCalledOnce()
    expect(sdk.startView).toHaveBeenCalledWith(ROUTE.id)
    expect(sdk.stopSession).toHaveBeenCalledOnce()
  })

  it('never re-authorizes via startRum while the gate is closed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })),
    )
    await startRum(BOOTSTRAP, ROUTE)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    expect(sdk.startView).not.toHaveBeenCalled()
    expect(sdk.init).toHaveBeenCalledOnce()

    const homeRoute = { id: 'routes/public/home', template: '/' }
    const adminRoute = { id: 'routes/admin/posts/analytics', template: '/admin/posts/:postId/analytics' }
    await startRum(BOOTSTRAP, homeRoute)
    await startRum(BOOTSTRAP, adminRoute)
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    expect(sdk.startView).not.toHaveBeenCalled()
    expect(sdk.stopSession).toHaveBeenCalledOnce()
    expect(sdk.init).toHaveBeenCalledOnce()
    expect(sdk.setViewName).toHaveBeenLastCalledWith(adminRoute.id)
    const state = Reflect.get(globalThis, Symbol.for('kobato.rum.runtime')) as Record<string, unknown>
    expect(state.consent).toBe('not-granted')
    expect(state.route).toEqual(adminRoute)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('granted')
    expect(sdk.startView).toHaveBeenCalledOnce()
    expect(sdk.startView).toHaveBeenCalledWith(adminRoute.id)
  })

  it('resumes an open editor route in place without unmounting or navigating', async () => {
    const editorRoute = { id: 'routes/editor/post/edit', template: '/editor/post/:id' }
    await startRum(BOOTSTRAP, editorRoute)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) })),
    )
    await __pollRumStatusForTests()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    )
    await __pollRumStatusForTests()

    expect(sdk.startView).toHaveBeenCalledWith('routes/editor/post/edit')
  })

  it('has no reload/navigation recovery path or test seam', async () => {
    const source = readFileSync(join(process.cwd(), 'src/client/lib/openobserve-rum.ts'), 'utf8')
    expect(source).not.toMatch(/\.reload\s*\(|reloadPage|__setRumPageReloadForTests/)
    const module = await import('@/client/lib/openobserve-rum')
    expect(Reflect.get(module, '__setRumPageReloadForTests')).toBeUndefined()
  })

  it('does not resume from a stale response after polling stopped', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    let resolveFetch!: (value: { ok: boolean; json: () => Promise<{ enabled: boolean }> }) => void
    const pending = new Promise<{ ok: boolean; json: () => Promise<{ enabled: boolean }> }>((resolve) => {
      resolveFetch = resolve
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => pending),
    )

    const polling = __pollRumStatusForTests()
    stopRum()
    resolveFetch({ ok: true, json: async () => ({ enabled: true }) })
    await polling

    expect(sdk.startView).not.toHaveBeenCalled()
  })

  it('fails closed on a rejected status fetch or malformed payload', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')

    sdk.setTrackingConsent.mockReset()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: 'yes' }) })),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
  })

  it('never grants or starts a view while DNT is enabled', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('granted')

    Object.defineProperty(window.navigator, 'doNotTrack', { configurable: true, value: '1' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })),
    )
    await __pollRumStatusForTests()
    expect(sdk.setTrackingConsent).toHaveBeenLastCalledWith('not-granted')
    expect(sdk.stopSession).toHaveBeenCalledOnce()
    expect(sdk.startView).not.toHaveBeenCalled()
  })
})

describe('tracing propagation predicate', () => {
  const origin = 'http://localhost:4321'

  it('allows same-origin fetch/XHR URLs only', () => {
    expect(isTraceableRumUrl('http://localhost:4321/rpc/content.home', origin)).toBe(true)
    expect(isTraceableRumUrl('/posts/hello.data', origin)).toBe(true)
    expect(isTraceableRumUrl('https://localhost:4321/rpc/content.home', origin)).toBe(false)
    expect(isTraceableRumUrl('https://cdn.example.com/app.js', origin)).toBe(false)
    expect(isTraceableRumUrl('not a url', origin)).toBe(false)
  })

  it('excludes the analytics beacon/SSE, OpenObserve intake, and probes', () => {
    expect(isTraceableRumUrl('http://localhost:4321/api/analytics/env', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/api/analytics/events', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/rum/v1/default/rum', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/api/rum/intake/rum/v1/default/rum', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/health', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/ready', origin)).toBe(false)
    expect(isTraceableRumUrl('http://localhost:4321/api/rum/status', origin)).toBe(false)
    expect(isSelfTelemetryRumUrl('http://localhost:4321/api/rum/status', origin)).toBe(true)
    expect(isSelfTelemetryRumUrl('http://localhost:4321/api/rum/intake/rum/v1/default/rum', origin)).toBe(true)
    expect(isSelfTelemetryRumUrl('http://localhost:4321/api/analytics/env', origin)).toBe(true)
  })

  it('registers only the tracecontext propagator', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    const configuration = initConfiguration()
    expect(configuration.allowedTracingUrls).toHaveLength(1)
    expect(configuration.allowedTracingUrls[0].propagatorTypes).toEqual(['tracecontext'])
    expect(configuration.excludedActivityUrls).toHaveLength(1)
  })

  it('wires the allowlist beforeSend policy and rewrites view identity', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    const { beforeSend } = initConfiguration()
    const event = makeViewEvent()

    expect(beforeSend(event, {})).toBe(true)
    expect(event).toMatchObject({
      view: {
        name: 'routes/public/post/detail',
        url: 'http://localhost:3000/posts/:slug',
      },
    })
    expect(event).not.toHaveProperty('usr')
    expect(beforeSend({ type: 'action' }, {})).toBe(false)
  })

  it('never claims correlation for the initial hard navigation', async () => {
    await startRum(BOOTSTRAP, ROUTE)
    const { beforeSend } = initConfiguration()
    const view = makeViewEvent()
    // Even if the SDK attached a document trace id to the view, the policy
    // strips it: only browser-initiated resource/error events may correlate.
    ;(view._o2 as Record<string, unknown>).trace_id = RUM_TEST_TRACE_ID

    expect(beforeSend(view, { location: globalThis.location })).toBe(true)
    expect((view as any)._o2).not.toHaveProperty('trace_id')
  })
})
