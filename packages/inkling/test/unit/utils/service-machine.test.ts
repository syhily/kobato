import { describe, expect, it, vi } from 'vitest'

import { createRequestTrack } from '@/utils/services/request-track'
import { runTrackedRequest } from '@/utils/services/service-machine'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('runTrackedRequest', () => {
  it('never starts an already-stale generation', async () => {
    const track = createRequestTrack()
    const stale = track.next()
    track.next()
    const request = vi.fn(() => Promise.resolve('value'))

    const outcome = await runTrackedRequest(track, stale, request)

    expect(request).not.toHaveBeenCalled()
    expect(outcome).toBeUndefined()
  })

  it('resolves the captured value while the generation is latest', async () => {
    const track = createRequestTrack()
    const generation = track.next()

    const outcome = await runTrackedRequest(track, generation, () => Promise.resolve('value'))

    expect(outcome).toEqual({ ok: true, value: 'value' })
  })

  it('captures a rejection as data instead of throwing', async () => {
    const track = createRequestTrack()
    const generation = track.next()
    const failure = new Error('host down')

    const outcome = await runTrackedRequest(track, generation, () => Promise.reject(failure))

    expect(outcome).toEqual({ ok: false, error: failure })
  })

  it('a newer generation supersedes an in-flight resolve', async () => {
    const track = createRequestTrack()
    const first = track.next()
    const slow = deferred<string>()

    const pending = runTrackedRequest(track, first, () => slow.promise)
    track.next()
    slow.resolve('stale')

    await expect(pending).resolves.toBeUndefined()
  })

  it('a newer generation supersedes an in-flight rejection', async () => {
    const track = createRequestTrack()
    const first = track.next()
    const slow = deferred<string>()

    const pending = runTrackedRequest(track, first, () => slow.promise)
    track.next()
    slow.reject(new Error('stale failure'))

    await expect(pending).resolves.toBeUndefined()
  })

  it('dispose supersedes an in-flight request', async () => {
    const track = createRequestTrack()
    const generation = track.next()
    const slow = deferred<string>()

    const pending = runTrackedRequest(track, generation, () => slow.promise)
    track.dispose()
    slow.resolve('too late')

    await expect(pending).resolves.toBeUndefined()
  })

  it('a generation that deliberately joins the current track still resolves', async () => {
    const track = createRequestTrack()
    track.next()

    const outcome = await runTrackedRequest(track, track.current(), () => Promise.resolve('joined'))

    expect(outcome).toEqual({ ok: true, value: 'joined' })
  })
})
