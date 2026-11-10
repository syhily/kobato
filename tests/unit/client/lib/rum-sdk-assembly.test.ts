import type { RumBeforeSend } from '@openobserve/browser-rum-slim'

import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

import { makeErrorEvent, makeLongTaskEvent, makeResourceEvent, makeViewEvent } from '#/_helpers/rum-events'
import { createRumEventPolicy } from '@/client/lib/rum-sanitizer'

// Real SDK 0.4.3 assembly path. `beforeSend` is invoked through
// `limitModification`, which deep-clones the event, calls the policy on the
// clone, and copies back ONLY the SDK's declared modifiable fields. It also
// ignores `false` for view events. This suite pins that behavior instead of
// trusting a unit test that calls `beforeSend` directly on the event.

const require = createRequire(import.meta.url)
const slimRequire = createRequire(require.resolve('@openobserve/browser-rum-slim'))

const { LifeCycle } = slimRequire('@openobserve/browser-rum-core') as {
  LifeCycle: new () => {
    subscribe: (eventType: number, callback: (event: Record<string, unknown>) => void) => void
    notify: (eventType: number, data: Record<string, unknown>) => void
  }
}
const { startRumAssembly } = slimRequire('@openobserve/browser-rum-core/cjs/domain/assembly.js') as {
  startRumAssembly: (
    configuration: Record<string, unknown>,
    lifeCycle: unknown,
    assembleHook: { trigger: (input: Record<string, unknown>) => Record<string, unknown> },
    reportError: (error: unknown) => void,
    eventRateLimit: number,
  ) => void
}

const RAW_RUM_EVENT_COLLECTED = 12
const RUM_EVENT_COLLECTED = 13

function runAssembly(rawRumEvent: Record<string, unknown>, beforeSend: RumBeforeSend): Record<string, any> | undefined {
  const lifeCycle = new LifeCycle()
  const collected: Array<Record<string, any>> = []
  lifeCycle.subscribe(RUM_EVENT_COLLECTED, (event) => collected.push(event))

  const session = rawRumEvent.session as Record<string, unknown>
  const view = rawRumEvent.view as Record<string, unknown>
  const assembleHook = {
    trigger: ({ eventType }: Record<string, unknown>) => ({
      type: eventType,
      _o2: { format_version: 2 },
      application: { id: 'kobato-dev' },
      date: 1,
      session: { id: session.id },
      view: { id: view.id },
    }),
  }

  startRumAssembly(
    {
      beforeSend,
      env: 'development',
      service: 'kobato',
      version: '7.1.0-dev',
      sdkVersion: '0.4.3',
    },
    lifeCycle,
    assembleHook,
    vi.fn(),
    1000,
  )

  lifeCycle.notify(RAW_RUM_EVENT_COLLECTED, {
    startClocks: { relative: 0, timeStamp: 0 },
    duration: undefined,
    rawRumEvent,
    domainContext: { location: { href: 'http://localhost:4321/posts/secret-slug?draft=true#body' } },
  })

  return collected[0]
}

function realisticViewEvent(): Record<string, any> {
  const event = makeViewEvent()
  // The real SDK never sets user/account context because Kobato never calls
  // setUser/setAccount. Device/display/privacy ARE auto-collected and are
  // non-modifiable (the O2 ingest allowlist owns them).
  delete event.usr
  delete event.account
  return event
}

describe('real SDK assembly: view events cannot be dropped', () => {
  it('still sends a view when beforeSend returns false (SDK 0.4.3 limitation)', () => {
    const raw = realisticViewEvent()
    const sent = runAssembly(raw, () => false)

    expect(sent).toBeDefined()
    expect(sent!.type).toBe('view')
    // Raw modifiable fields were never overwritten, so this is exactly the
    // limitation the policy must compensate for.
    expect(sent!.view.url).toBe(raw.view.url)
  })

  it('writes trusted view fields before a throwing sanitizer and never leaks the raw URL', () => {
    const policy = createRumEventPolicy({
      getScope: () => {
        throw new Error('scope unavailable')
      },
      service: 'kobato',
      version: '7.1.0-dev',
    })
    const sent = runAssembly(realisticViewEvent(), policy.beforeSend)

    expect(sent).toBeDefined()
    expect(sent!.view.name).toBe('unknown')
    expect(sent!.view.url).toBe('/unknown')
    expect(sent!.view.referrer).toBe('')
    expect(sent!.view.performance.lcp.resource_url).toBe('')

    const serialized = JSON.stringify(sent)
    expect(serialized).not.toContain('secret-slug')
    expect(serialized).not.toContain('draft=true')
    expect(serialized).not.toContain('#body')
    // SDK limitation: non-modifiable fields survive and belong to the O2
    // ingest allowlist.
    expect(sent!.device).toBeDefined()
    expect(sent!.context).toBeUndefined()
  })

  it('writes the fixed fallback for an unknown route', () => {
    const policy = createRumEventPolicy({
      getScope: () => null,
      service: 'kobato',
      version: '7.1.0-dev',
    })
    const sent = runAssembly(realisticViewEvent(), policy.beforeSend)

    expect(sent!.view.name).toBe('unknown')
    expect(sent!.view.url).toBe('/unknown')
    expect(JSON.stringify(sent)).not.toContain('secret-slug')
  })

  it('overwrites hostile modifiable view fields before the SDK copies them back', () => {
    const policy = createRumEventPolicy({
      getScope: () => ({
        origin: 'http://localhost:4321',
        route: { id: 'routes/public/post/detail', template: '/posts/:slug' },
      }),
      service: 'kobato',
      version: '7.1.0-dev',
    })
    const raw = realisticViewEvent()
    raw.view = {
      ...raw.view,
      name: { slug: 'secret-slug' },
      url: 12345,
      referrer: 'https://evil.example/secret?token=1',
      performance: {
        ...raw.view.performance,
        lcp: {
          ...raw.view.performance.lcp,
          resource_url: 'https://evil.example/lcp?secret=1',
        },
      },
    }

    const sent = runAssembly(raw, policy.beforeSend)

    expect(sent!.view.name).toBe('routes/public/post/detail')
    expect(sent!.view.url).toBe('http://localhost:4321/posts/:slug')
    expect(sent!.view.referrer).toBe('')
    expect(sent!.view.performance.lcp.resource_url).toBe('')
    expect(JSON.stringify(sent)).not.toContain('evil.example')
    expect(JSON.stringify(sent)).not.toContain('secret-slug')
  })

  it('uses the trusted route template for a normal view', () => {
    const policy = createRumEventPolicy({
      getScope: () => ({
        origin: 'http://localhost:4321',
        route: { id: 'routes/public/post/detail', template: '/posts/:slug' },
      }),
      service: 'kobato',
      version: '7.1.0-dev',
    })
    const sent = runAssembly(realisticViewEvent(), policy.beforeSend)

    expect(sent!.view.name).toBe('routes/public/post/detail')
    expect(sent!.view.url).toBe('http://localhost:4321/posts/:slug')
    expect(sent!.view.referrer).toBe('')
    expect(JSON.stringify(sent)).not.toContain('secret-slug')
  })
})

describe('real SDK assembly: non-view events still drop', () => {
  it('drops a resource when beforeSend returns false', () => {
    expect(runAssembly(makeResourceEvent(), () => false)).toBeUndefined()
  })

  it('copies back the modifiable error/resource/long-task fields exactly', () => {
    const policy = createRumEventPolicy({
      getScope: () => ({
        origin: 'http://localhost:4321',
        route: { id: 'routes/public/post/detail', template: '/posts/:slug' },
      }),
      service: 'kobato',
      version: '7.1.0-dev',
    })

    const error = runAssembly(makeErrorEvent(), policy.beforeSend)
    expect(error!.error.message).toBe('network_error')
    expect(error!.error.stack).not.toContain('secret-slug')
    expect(error!.error.handling_stack).toBe('')
    expect(error!.error.fingerprint).toBe('')
    expect(error!.error.resource.url).toBe('/posts/:slug')

    const resource = runAssembly(makeResourceEvent(), policy.beforeSend)
    expect(resource!.resource.url).toBe('/rpc/content.home')
    expect(resource!.resource.request.headers).toEqual({})
    expect(resource!.resource.response.headers).toEqual({})
    expect(resource!.resource.graphql.variables).toBe('')

    const longTask = runAssembly(makeLongTaskEvent(), policy.beforeSend)
    expect(longTask!.long_task.scripts[0].source_url).toBe('')
    expect(longTask!.long_task.scripts[0].invoker).toBe('')
  })
})
