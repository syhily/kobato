// @vitest-environment happy-dom

import type { RealtimeEvent } from '@kobato/api/contracts/admin/analytics'

import { useEventStream } from '@kobato/web-admin/ui/analytics/use-event-stream'
import { renderHook, waitFor } from '@testing-library/react'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ events: vi.fn() }))
const apiClientMod = await import('@kobato/api/browser/client')
vi.spyOn(apiClientMod, 'orpc', 'get').mockImplementation(
  () => ({ admin: { analytics: { events: api.events } } }) as never,
)

afterAll(() => {
  vi.restoreAllMocks()
})

function makeEvent(ts: string, path: string): RealtimeEvent {
  return { ts, path, country: null, city: null, browser: null, os: null, deviceType: null, isBot: false }
}

function iteratorOf(batches: RealtimeEvent[][]) {
  let index = 0
  const iterator = {
    closed: false,
    async next(): Promise<IteratorResult<RealtimeEvent[]>> {
      if (index >= batches.length) {
        return new Promise(() => {})
      }
      return { done: false, value: batches[index++]! }
    },
    async return(): Promise<IteratorResult<RealtimeEvent[]>> {
      iterator.closed = true
      return { done: true, value: undefined }
    },
    [Symbol.asyncIterator]() {
      return iterator
    },
  }
  return iterator
}

beforeEach(() => {
  api.events.mockReset()
})

describe('useEventStream', () => {
  it('dedupes the resent tail and keeps distinct events that share a timestamp', async () => {
    const e1 = makeEvent('2026-08-01T00:00:01.000Z', '/a')
    const e2 = makeEvent('2026-08-01T00:00:01.000Z', '/b')
    const e3 = makeEvent('2026-08-01T00:00:02.000Z', '/c')
    api.events.mockResolvedValue(
      iteratorOf([
        [e1, e2],
        [e2, e3],
      ]),
    )
    const { result } = renderHook(() => useEventStream({ bufferSize: 10 }))

    await waitFor(() => expect(result.current.events).toEqual([e1, e2, e3]))
    expect(result.current.state).toBe('live')
  })

  it('advances the since watermark and closes the old iterator on resubscribe', async () => {
    const first = iteratorOf([
      [makeEvent('2026-08-01T00:00:01.000Z', '/a')],
      [makeEvent('2026-08-01T00:00:01.000Z', '/a'), makeEvent('2026-08-01T00:00:02.000Z', '/b')],
    ])
    const second = iteratorOf([])
    api.events.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const { result, rerender } = renderHook(({ enabled }) => useEventStream({ bufferSize: 10, enabled }), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.events).toHaveLength(2))

    rerender({ enabled: false })
    expect(first.closed).toBe(true)
    rerender({ enabled: true })
    await waitFor(() => expect(api.events).toHaveBeenCalledTimes(2))
    expect(api.events.mock.calls[1]![0]).toEqual({ since: '2026-08-01T00:00:02.000Z' })
  })
})
