import { startRouteWarmup } from '@kobato/client/scripts/route-warmup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The unit project runs under `environment: 'node'`, so there is no
// `document`/`navigator`. Hand-roll just enough of the DOM surface to drive
// `startRouteWarmup`'s scheduling + link-creation logic, and advance fake
// timers to step through the idle batches.

interface StubLink {
  rel: string
  href: string
  remove: ReturnType<typeof vi.fn>
}

function setupDocument(initialVisibility = 'visible') {
  const links: StubLink[] = []
  const visibilityListeners: Array<() => void> = []
  const doc = {
    visibilityState: initialVisibility,
    head: {
      appendChild: vi.fn((node: StubLink) => {
        links.push(node)
      }),
    },
    createElement: vi.fn(() => {
      const link: StubLink = { rel: '', href: '', remove: vi.fn() }
      return link
    }),
    addEventListener: vi.fn((_event: string, cb: () => void) => {
      visibilityListeners.push(cb)
    }),
    removeEventListener: vi.fn(),
  }
  return { doc, links, visibilityListeners }
}

describe('startRouteWarmup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('skips entirely when the user has data-saver enabled', () => {
    const { doc } = setupDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { connection: { saveData: true, effectiveType: '4g' } })

    startRouteWarmup(['/assets/a.js', '/assets/b.js'])
    vi.advanceTimersByTime(10_000)

    expect(doc.createElement).not.toHaveBeenCalled()
  })

  it('skips on a 2g connection', () => {
    const { doc } = setupDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', { connection: { saveData: false, effectiveType: '2g' } })

    startRouteWarmup(['/assets/a.js'])
    vi.advanceTimersByTime(10_000)

    expect(doc.createElement).not.toHaveBeenCalled()
  })

  it('preloads in batches of 5 when visible, then removes the link nodes', () => {
    const { doc, links } = setupDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {}) // no connection -> not skipped

    const chunks = Array.from({ length: 7 }, (_, i) => `/assets/c${i}.js`)
    startRouteWarmup(chunks)

    // Nothing happens before the initial 2s delay.
    expect(doc.createElement).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)

    // First batch is exactly 5 links, marked modulepreload, in order.
    expect(doc.createElement).toHaveBeenCalledTimes(5)
    expect(doc.head.appendChild).toHaveBeenCalledTimes(5)
    expect(links.map((l) => l.href)).toEqual(chunks.slice(0, 5))
    expect(links.every((l) => l.rel === 'modulepreload')).toBe(true)

    // No requestIdleCallback in node -> fallback setTimeout(run, 100) drains
    // the remaining 2 chunks.
    vi.advanceTimersByTime(100)
    expect(doc.createElement).toHaveBeenCalledTimes(7)

    // 5s after the final batch, every link node is removed.
    vi.advanceTimersByTime(5000)
    expect(links.every((l) => l.remove.mock.calls.length === 1)).toBe(true)
  })

  it('schedules subsequent batches via requestIdleCallback when available', () => {
    const idle = vi.fn((_cb: () => void, _opts?: { timeout: number }) => 0)
    const { doc } = setupDocument()
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('requestIdleCallback', idle)

    startRouteWarmup(Array.from({ length: 7 }, (_, i) => `/assets/c${i}.js`))
    vi.advanceTimersByTime(2000)

    // 5 loaded in the first batch; the remaining 2 trigger an idle schedule.
    expect(doc.createElement).toHaveBeenCalledTimes(5)
    expect(idle).toHaveBeenCalledOnce()
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2000 })
  })

  it('waits for the page to become visible before starting when hidden', () => {
    const { doc, visibilityListeners } = setupDocument('hidden')
    vi.stubGlobal('document', doc)
    vi.stubGlobal('navigator', {})

    startRouteWarmup(['/assets/a.js'])

    vi.advanceTimersByTime(10_000) // still hidden -> nothing
    expect(doc.createElement).not.toHaveBeenCalled()

    // Page becomes visible: the listener fires, removes itself, then waits 1s.
    doc.visibilityState = 'visible'
    expect(visibilityListeners).toHaveLength(1)
    visibilityListeners[0]!()
    expect(doc.removeEventListener).toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(doc.createElement).toHaveBeenCalledTimes(1)
  })
})
