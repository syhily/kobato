// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RealtimeEvent } from '@/shared/contracts/analytics'

import { useEventStream } from '@/ui/admin/analytics/use-event-stream'

// The hook subscribes through the browser's native EventSource; the fake
// below records every constructed instance so tests can drive 'events'
// messages by hand — including the resend-the-tail behavior of a native
// reconnect, which reuses the original URL with a stale `since` (audit
// P1-20).

class FakeEventSource {
  static instances: FakeEventSource[] = []

  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>()

  constructor(
    public readonly url: string,
    public readonly init?: EventSourceInit,
  ) {
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  close(): void {
    this.closed = true
  }

  /** Deliver an `events` SSE message exactly like the server would. */
  emit(payload: unknown): void {
    const event = new MessageEvent('events', { data: JSON.stringify(payload) })
    for (const listener of this.listeners.get('events') ?? []) {
      listener(event)
    }
  }
}

function makeEvent(ts: string, path: string): RealtimeEvent {
  return { ts, path, country: null, city: null, browser: null, os: null, deviceType: null, isBot: false }
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useEventStream', () => {
  it('dedupes the resent tail after a native reconnect', () => {
    const { result } = renderHook(() => useEventStream({ bufferSize: 10 }))
    const source = FakeEventSource.instances[0]!

    const e1 = makeEvent('2026-08-01T00:00:01.000Z', '/a')
    const e2 = makeEvent('2026-08-01T00:00:02.000Z', '/b')
    act(() => source.emit([e1, e2]))
    expect(result.current.events).toEqual([e1, e2])

    // A native reconnect reuses the original (stale-since) URL, so the
    // server resends e2 ahead of the genuinely new e3 — the buffer must
    // not grow a duplicate row.
    const e3 = makeEvent('2026-08-01T00:00:03.000Z', '/c')
    act(() => source.emit([e2, e3]))
    expect(result.current.events).toEqual([e1, e2, e3])
  })

  it('keeps distinct events that share a timestamp', () => {
    const { result } = renderHook(() => useEventStream({ bufferSize: 10 }))
    const source = FakeEventSource.instances[0]!

    const e1 = makeEvent('2026-08-01T00:00:01.000Z', '/a')
    const e2 = makeEvent('2026-08-01T00:00:01.000Z', '/b')
    act(() => source.emit([e1, e2]))
    expect(result.current.events).toEqual([e1, e2])
  })

  it('advances the since watermark past resent events for the next subscribe', () => {
    const { rerender } = renderHook(({ enabled }) => useEventStream({ bufferSize: 10, enabled }), {
      initialProps: { enabled: true },
    })
    const first = FakeEventSource.instances[0]!
    expect(first.url).not.toContain('since=')

    // A reconnect resends the last-seen event; the watermark must still
    // move to the newest ts the server reported, not stall on the dup.
    act(() => first.emit([makeEvent('2026-08-01T00:00:01.000Z', '/a')]))
    act(() => first.emit([makeEvent('2026-08-01T00:00:01.000Z', '/a'), makeEvent('2026-08-01T00:00:02.000Z', '/b')]))

    // An effect re-run (here: the enabled toggle) rebuilds the URL from
    // the watermark.
    rerender({ enabled: false })
    expect(first.closed).toBe(true)
    rerender({ enabled: true })
    const second = FakeEventSource.instances[1]!
    expect(second.url).toContain(`since=${encodeURIComponent('2026-08-01T00:00:02.000Z')}`)
  })
})
