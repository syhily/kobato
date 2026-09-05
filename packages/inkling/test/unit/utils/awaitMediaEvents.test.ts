import { afterEach, describe, expect, it, vi } from 'vitest'

import { awaitMediaEvents, MEDIA_LOAD_TIMEOUT_MS } from '@/utils/awaitMediaEvents'

afterEach(() => {
  vi.useRealTimers()
})

describe('awaitMediaEvents', () => {
  it('resolves once each listed event has fired, in any order', async () => {
    const element = new EventTarget()
    const wait = awaitMediaEvents(element, {
      events: ['loadedmetadata', 'canplay'],
      errorMessage: 'failed',
    })

    element.dispatchEvent(new Event('canplay'))
    element.dispatchEvent(new Event('loadedmetadata'))

    await expect(wait).resolves.toBeUndefined()
  })

  it('runs start after the listeners attach, so a synchronous dispatch is caught', async () => {
    const element = new EventTarget()

    await expect(
      awaitMediaEvents(element, {
        events: ['load'],
        errorMessage: 'failed',
        start: () => element.dispatchEvent(new Event('load')),
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects with the error message when the element errors', async () => {
    const element = new EventTarget()
    const wait = awaitMediaEvents(element, { events: ['load'], errorMessage: 'Failed to load' })

    element.dispatchEvent(new Event('error'))

    await expect(wait).rejects.toThrow('Failed to load')
  })

  it('rejects on its own after the timeout', async () => {
    vi.useFakeTimers()
    const element = new EventTarget()
    const wait = awaitMediaEvents(element, { events: ['load'], errorMessage: 'Failed to load', timeoutMs: 500 })

    const assertion = expect(wait).rejects.toThrow('Failed to load (timed out after 500 ms)')
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it('defaults the timeout to MEDIA_LOAD_TIMEOUT_MS', async () => {
    vi.useFakeTimers()
    const element = new EventTarget()
    const wait = awaitMediaEvents(element, { events: ['load'], errorMessage: 'Failed to load' })

    const assertion = expect(wait).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(MEDIA_LOAD_TIMEOUT_MS)
    await assertion
  })

  it('ignores late events after settling', async () => {
    const element = new EventTarget()
    const wait = awaitMediaEvents(element, { events: ['load'], errorMessage: 'Failed to load' })

    element.dispatchEvent(new Event('load'))
    await expect(wait).resolves.toBeUndefined()

    // A late error must not flip the settled promise or throw.
    element.dispatchEvent(new Event('error'))
    await expect(wait).resolves.toBeUndefined()
  })
})
