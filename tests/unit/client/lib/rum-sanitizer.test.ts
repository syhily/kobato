import { describe, expect, it } from 'vitest'

import {
  makeErrorEvent,
  makeLongTaskEvent,
  makeResourceEvent,
  makeScope,
  makeViewEvent,
  RUM_TEST_SESSION_ID,
  RUM_TEST_SPAN_ID,
  RUM_TEST_TRACE_ID,
} from '#/_helpers/rum-events'
import { RUM_EVENT_LIMITS } from '@/client/lib/rum-budget'
import { createRumEventPolicy, projectRumEvent } from '@/client/lib/rum-sanitizer'

type ProjectedEvent = Record<string, any>

function project(event: Record<string, unknown>, scope = makeScope()): ProjectedEvent {
  const projected = projectRumEvent(event, scope)
  expect(projected).not.toBeNull()
  return projected as ProjectedEvent
}

describe('RUM view projection', () => {
  it('replaces every raw URL/name with the route template and route id', () => {
    const event = makeViewEvent()
    const projected = project(event)

    expect(projected.view.name).toBe('routes/public/post/detail')
    expect(projected.view.url).toBe('http://localhost:4321/posts/:slug')
    expect(JSON.stringify(projected)).not.toContain('secret-slug')
    expect(JSON.stringify(projected)).not.toContain('draft=true')
  })

  it('keeps timings, navigation type, Web Vitals, and counts', () => {
    const projected = project(makeViewEvent())
    expect(projected.view).toMatchObject({
      loading_time: 120_000_000,
      network_settled_time: 80_000_000,
      time_spent: 900_000_000,
      dom_complete: 300_000_000,
      dom_content_loaded: 250_000_000,
      dom_interactive: 200_000_000,
      load_event: 400_000_000,
      first_byte: 20_000_000,
      loading_type: 'initial_load',
      is_active: true,
      is_slow_rendered: false,
      action: { count: 0 },
      error: { count: 1 },
      long_task: { count: 2 },
      resource: { count: 12 },
    })
    expect(projected.view.performance).toEqual({
      cls: { score: 0.02, timestamp: 1000 },
      fcp: { timestamp: 150_000_000 },
      inp: {
        duration: 40_000_000,
        timestamp: 500_000_000,
        sub_parts: { input_delay: 10_000_000, processing_duration: 20_000_000, presentation_delay: 10_000_000 },
      },
      lcp: {
        timestamp: 180_000_000,
        resource_url: '',
        sub_parts: { load_delay: 10_000_000, load_time: 20_000_000, render_delay: 5_000_000 },
      },
    })
  })

  it('drops DOM selectors, LCP resource URLs, rects, scroll depth, and device/user identity', () => {
    const projected = project(makeViewEvent())

    expect(projected.view).not.toHaveProperty('largest_contentful_paint_target_selector')
    expect(projected.view).not.toHaveProperty('interaction_to_next_paint_target_selector')
    expect(projected.view).not.toHaveProperty('cumulative_layout_shift_target_selector')
    expect(projected.view).not.toHaveProperty('custom_timings')
    expect(projected.view.performance.cls).not.toHaveProperty('target_selector')
    expect(projected.view.performance.cls).not.toHaveProperty('previous_rect')
    expect(projected.view.performance.lcp.resource_url).toBe('')
    expect(projected.view.performance.inp).not.toHaveProperty('target_selector')

    for (const key of ['usr', 'account', 'context', 'device', 'connectivity', 'display', 'privacy']) {
      expect(projected).not.toHaveProperty(key)
    }
    expect(JSON.stringify(projected)).not.toContain('user@example.com')
    expect(JSON.stringify(projected)).not.toContain('Asia/Shanghai')
  })

  it('keeps only SDK metadata and trace-independent _o2 fields for views', () => {
    const projected = project(makeViewEvent())
    expect(projected._o2).toEqual({
      format_version: 2,
      browser_sdk_version: '0.4.3',
      sdk_name: 'rum-slim',
      session: { plan: 1, session_precondition: 'user_app_launch' },
      configuration: {
        session_sample_rate: 100,
        session_replay_sample_rate: 0,
        profiling_sample_rate: 0,
        trace_sample_rate: 100,
      },
    })
    expect(projected._o2).not.toHaveProperty('drift')
    expect(projected.view).not.toHaveProperty('_o2')
  })

  it('sanitizes o2tags to the closed tag key set', () => {
    const event = makeViewEvent({ o2tags: 'env:development,bad key:value,service:kobato,secret:slug' })
    const projected = project(event)
    expect(projected.o2tags).toBe('env:development,service:kobato')
  })
})

describe('RUM resource projection', () => {
  it('keeps type/method/status/duration, coarse sizes, and timing phases', () => {
    const projected = project(makeResourceEvent())
    expect(projected.resource).toMatchObject({
      type: 'fetch',
      method: 'GET',
      url: '/rpc/content.home',
      status_code: 200,
      duration: 12_000_000,
      size: 16384,
      transfer_size: 16384,
      render_blocking_status: 'non-blocking',
      delivery_type: 'cache',
      protocol: 'h2',
      dns: { duration: 1_000_000, start: 0 },
      connect: { duration: 2_000_000, start: 1_000_000 },
      ssl: { duration: 1_000_000, start: 2_000_000 },
      first_byte: { duration: 3_000_000, start: 3_000_000 },
      download: { duration: 4_000_000, start: 6_000_000 },
    })
    expect(projected.resource.request).toEqual({})
    expect(projected.resource.response).toEqual({})
    expect(projected.resource.graphql).toEqual({ variables: '' })
    expect(projected.resource).not.toHaveProperty('provider')
    expect(projected.resource).not.toHaveProperty('encoded_body_size')
    expect(JSON.stringify(projected)).not.toContain('Bearer secret')
    expect(JSON.stringify(projected)).not.toContain('sid=secret')
  })

  it('normalizes a real oRPC resource URL and an error resource URL', () => {
    const resource = project(
      makeResourceEvent({ url: 'http://localhost:4321/rpc/content/posts/bySlug?slug=secret&draft=true' }),
    )
    expect(resource.resource.url).toBe('/rpc/content.posts.bySlug')

    const error = project(
      makeErrorEvent({
        resource: {
          method: 'POST',
          status_code: 500,
          url: 'http://localhost:4321/rpc/admin/posts/mySummary?x=1#frag',
        },
      }),
    )
    expect(error.error.resource.url).toBe('/rpc/admin.posts.mySummary')
  })

  it('preserves the W3C trace/span ids used for RUM→server correlation', () => {
    const projected = project(makeResourceEvent())
    expect(projected._o2).toMatchObject({
      trace_id: RUM_TEST_TRACE_ID,
      span_id: RUM_TEST_SPAN_ID,
      rule_psr: 100,
    })
    expect(projected._o2).not.toHaveProperty('discarded')
  })

  it('drops a resource whose URL has no recognized family', () => {
    expect(projectRumEvent(makeResourceEvent({ url: 'https://cdn.example.com/app.js' }), makeScope())).toBeNull()
    expect(projectRumEvent(makeResourceEvent({ url: 'http://localhost:4321/a/b/c/d' }), makeScope())).toBeNull()
  })

  it('drops a resource with an unknown resource type', () => {
    expect(projectRumEvent(makeResourceEvent({ type: 'websocket' }), makeScope())).toBeNull()
  })
})

describe('RUM error projection', () => {
  it('replaces the free-form message with a fixed category and keeps a stable code', () => {
    const projected = project(makeErrorEvent())
    expect(projected.error).toMatchObject({
      type: 'ORPCError',
      source: 'network',
      handling: 'unhandled',
      code: 'http_404',
      message: 'network_error',
      resource: { method: 'GET', status_code: 404, url: '/posts/:slug' },
    })
    expect(projected.error.message).not.toContain('ORPCError')
    expect(projected.error.fingerprint).toBe('')
    expect(projected.error.handling_stack).toBe('')
    expect(projected.error).not.toHaveProperty('causes')
    expect(projected.error).not.toHaveProperty('threads')
    expect(projected.error).not.toHaveProperty('meta')
    expect(projected.error.resource).not.toHaveProperty('provider')
    expect(JSON.stringify(projected)).not.toContain('does not exist')
    expect(JSON.stringify(projected)).not.toContain('secret-slug')
    expect(JSON.stringify(projected)).not.toContain('database row')
  })

  it('keeps only same-origin source frame locations and strips function names', () => {
    const projected = project(makeErrorEvent())
    expect(projected.error.stack).toBe('at /src/routes/public/post/detail.tsx:42:7')
    expect(projected.error.stack).not.toContain('loadPost')
    expect(projected.error.stack).not.toContain('cdn.example.com')
    expect(projected.error.stack).not.toContain('eval')
  })

  it('overwrites a stack with no safe frames so the free-form message cannot survive', () => {
    const event = makeErrorEvent({ stack: 'Error: secret-slug leaked\n    at eval @ :370:30' })
    const projected = projectRumEvent(event, makeScope()) as ProjectedEvent
    expect(projected.error.stack).toBe('')
    expect(JSON.stringify(projected)).not.toContain('secret-slug leaked')
  })

  it('prefers a stable application error code from the domain context', () => {
    const event = makeErrorEvent({ resource: undefined })
    const projected = projectRumEvent(event, makeScope(), 'NOT_FOUND') as ProjectedEvent
    expect(projected.error.code).toBe('NOT_FOUND')
  })

  it('drops an error with an unknown source or without an error object', () => {
    expect(projectRumEvent(makeErrorEvent({ source: 'mystery' }), makeScope())).toBeNull()
    const withoutError = makeErrorEvent()
    delete withoutError.error
    expect(projectRumEvent(withoutError, makeScope())).toBeNull()
  })

  it('maps an unknown error type onto the closed Error class', () => {
    const projected = project(makeErrorEvent({ type: 'SecretRuntimeError' }))
    expect(projected.error.type).toBe('Error')
  })
})

describe('RUM long-task projection', () => {
  it('keeps durations only, never script URLs or invoker text', () => {
    const projected = project(makeLongTaskEvent())
    expect(projected.long_task).toEqual({
      duration: 80_000_000,
      blocking_duration: 50_000_000,
      entry_type: 'long-task',
      is_frozen_frame: false,
      scripts: [{ source_url: '', invoker: '' }],
    })
    expect(JSON.stringify(projected)).not.toContain('renderSecretSlug')
    expect(JSON.stringify(projected)).not.toContain('secret-slug')
  })
})

describe('RUM event shape validation', () => {
  it.each([
    ['null', null],
    ['a string', 'event'],
    ['an array', []],
    ['an empty object', {}],
    ['an action (tracking disabled)', { ...makeViewEvent(), type: 'action' }],
    ['a vital', { ...makeViewEvent(), type: 'vital' }],
    ['a missing date', { ...makeViewEvent(), date: undefined }],
    ['a NaN date', { ...makeViewEvent(), date: Number.NaN }],
    ['a missing application id', { ...makeViewEvent(), application: {} }],
    ['a missing session id', { ...makeViewEvent(), session: {} }],
    ['a malformed session id', { ...makeViewEvent(), session: { id: 'short', type: 'user' } }],
    ['a missing view id', { ...makeViewEvent(), view: { url: 'http://localhost:4321/' } }],
    ['no projectable view fields', { ...makeViewEvent(), view: { id: '018f2b6c-7d4e-7a3b-9c1d-2e3f4a5b6c7e' } }],
  ])('drops %s', (_label, event) => {
    expect(projectRumEvent(event, makeScope())).toBeNull()
  })

  it('drops an event whose scope route is not a stable ID/template', () => {
    expect(
      projectRumEvent(makeViewEvent(), { origin: 'http://localhost:4321', route: { id: '../x', template: '/a' } }),
    ).toBeNull()
    expect(
      projectRumEvent(makeViewEvent(), { origin: 'http://localhost:4321', route: { id: 'root', template: '/a b' } }),
    ).toBeNull()
    expect(
      projectRumEvent(makeViewEvent(), { origin: 'not-an-origin', route: { id: 'root', template: '/' } }),
    ).toBeNull()
  })
})

describe('RUM event budget', () => {
  function resource(index: number, sessionId = RUM_TEST_SESSION_ID): Record<string, unknown> {
    return makeResourceEvent(
      { url: 'http://localhost:4321/rpc/content.home' },
      { session: { id: sessionId, type: 'user' }, date: 1_760_000_000_000 + index },
    )
  }

  function error(index: number, sessionId = RUM_TEST_SESSION_ID): Record<string, unknown> {
    return makeErrorEvent({}, { session: { id: sessionId, type: 'user' }, date: 1_760_000_000_000 + index })
  }

  it(`accepts at most ${RUM_EVENT_LIMITS.resourcesPerSession} resource events per session`, () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    for (let index = 0; index < RUM_EVENT_LIMITS.resourcesPerSession; index += 1) {
      expect(policy.beforeSend(resource(index) as never, {} as never)).toBe(true)
    }
    const excess = resource(RUM_EVENT_LIMITS.resourcesPerSession)
    expect(policy.beforeSend(excess as never, {} as never)).toBe(false)
    // A dropped event is untouched, never partially sanitized or retried.
    expect(excess).toHaveProperty('resource')
  })

  it(`accepts at most ${RUM_EVENT_LIMITS.errorsPerSession} sanitized errors per session`, () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    for (let index = 0; index < RUM_EVENT_LIMITS.errorsPerSession; index += 1) {
      expect(policy.beforeSend(error(index) as never, {} as never)).toBe(true)
    }
    expect(policy.beforeSend(error(RUM_EVENT_LIMITS.errorsPerSession) as never, {} as never)).toBe(false)
  })

  it('resets both counters when the SDK session id changes', () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    for (let index = 0; index < RUM_EVENT_LIMITS.resourcesPerSession; index += 1) {
      policy.beforeSend(resource(index) as never, {} as never)
    }
    expect(policy.beforeSend(resource(0) as never, {} as never)).toBe(false)

    const nextSession = '018f2b6c-7d4e-7a3b-9c1d-000000000001'
    expect(policy.beforeSend(resource(0, nextSession) as never, {} as never)).toBe(true)
  })

  it('counts only accepted events: a dropped event does not consume budget', () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    const dropped = makeResourceEvent({ url: 'https://cdn.example.com/app.js' })
    expect(policy.beforeSend(dropped as never, {} as never)).toBe(false)
    for (let index = 0; index < RUM_EVENT_LIMITS.resourcesPerSession; index += 1) {
      expect(policy.beforeSend(resource(index) as never, {} as never)).toBe(true)
    }
  })

  it('restores a persisted per-session budget (page reload) and saves accepted counts', () => {
    const saved: Array<{ sessionId: string; resources: number; errors: number }> = []
    const store = {
      snapshot: { sessionId: RUM_TEST_SESSION_ID, resources: 498, errors: 99 },
      load() {
        return this.snapshot
      },
      save(snapshot: { sessionId: string; resources: number; errors: number }) {
        this.snapshot = snapshot
        saved.push(snapshot)
      },
    }
    const policy = createRumEventPolicy({ getScope: () => makeScope(), budgetStore: store })

    expect(policy.beforeSend(resource(0) as never, {} as never)).toBe(true)
    expect(policy.beforeSend(resource(1) as never, {} as never)).toBe(true)
    expect(policy.beforeSend(resource(2) as never, {} as never)).toBe(false)
    expect(saved.at(-1)).toMatchObject({ sessionId: RUM_TEST_SESSION_ID, resources: 500 })

    expect(policy.beforeSend(error(0) as never, {} as never)).toBe(true)
    expect(policy.beforeSend(error(1) as never, {} as never)).toBe(false)

    const nextSession = '018f2b6c-7d4e-7a3b-9c1d-000000000002'
    expect(policy.beforeSend(resource(3, nextSession) as never, {} as never)).toBe(true)
  })

  it('reset() clears session state', () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    for (let index = 0; index < RUM_EVENT_LIMITS.errorsPerSession; index += 1) {
      policy.beforeSend(error(index) as never, {} as never)
    }
    expect(policy.beforeSend(error(0) as never, {} as never)).toBe(false)
    policy.reset()
    expect(policy.beforeSend(error(0) as never, {} as never)).toBe(true)
  })
})

describe('RUM sanitizer failure closes', () => {
  it('sends a minimal safe view and drops a resource when the route scope is unavailable', () => {
    const policy = createRumEventPolicy({ getScope: () => null })
    const view = makeViewEvent()
    expect(policy.beforeSend(view as never, {} as never)).toBe(true)
    expect((view as any).view).toMatchObject({ name: 'unknown', url: '/unknown', referrer: '' })
    expect(JSON.stringify(view)).not.toContain('secret-slug')
    expect(policy.beforeSend(makeResourceEvent() as never, {} as never)).toBe(false)
  })

  it('writes safe view fields even when the scope resolver throws, and drops a resource', () => {
    const policy = createRumEventPolicy({
      getScope: () => {
        throw new Error('route lookup failed')
      },
    })
    const view = makeViewEvent()
    expect(policy.beforeSend(view as never, {} as never)).toBe(true)
    expect((view as any).view).toMatchObject({ name: 'unknown', url: '/unknown', referrer: '' })
    expect((view as any).view.performance.lcp.resource_url).toBe('')
    expect(policy.beforeSend(makeResourceEvent() as never, {} as never)).toBe(false)
  })

  it('keeps a hostile view safe and drops a hostile resource', () => {
    const hostileView = {
      ...makeViewEvent(),
      get session(): never {
        throw new Error('boom')
      },
    }
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    expect(policy.beforeSend(hostileView as never, {} as never)).toBe(true)
    expect((hostileView as any).view).toMatchObject({
      name: 'routes/public/post/detail',
      url: 'http://localhost:4321/posts/:slug',
    })
    expect((hostileView as any).view.url).not.toContain('secret-slug')

    const hostileResource = {
      ...makeResourceEvent(),
      get session(): never {
        throw new Error('boom')
      },
    }
    expect(policy.beforeSend(hostileResource as never, {} as never)).toBe(false)
  })

  it('never returns the original event object', () => {
    const event = makeViewEvent()
    const projected = projectRumEvent(event, makeScope())
    expect(projected).not.toBe(event)
    expect(projected).not.toEqual(event)
  })

  it('mutates the SDK event in place only after a successful projection', () => {
    const policy = createRumEventPolicy({ getScope: () => makeScope() })
    const event = makeViewEvent()
    expect(policy.beforeSend(event as never, {} as never)).toBe(true)
    expect((event as any).view.url).toBe('http://localhost:4321/posts/:slug')
    expect(event).not.toHaveProperty('device')
    expect(event).not.toHaveProperty('usr')
  })
})
