import { createInflight } from '@kobato/server/infra/cache/inflight'
import { describe, expect, it } from 'vitest'

describe('shared/inflight — createInflight', () => {
  it('dedupes concurrent calls for the same key into a single promise', async () => {
    const inflight = createInflight<number>()
    let runs = 0
    let resolveLoader: ((value: number) => void) | undefined
    const loader = () =>
      new Promise<number>((resolve) => {
        runs += 1
        resolveLoader = resolve
      })

    const a = inflight('k', loader)
    const b = inflight('k', loader)
    expect(runs).toBe(1)
    expect(inflight.size()).toBe(1)

    resolveLoader!(42)
    await Promise.all([a, b])
    expect(runs).toBe(1)
    expect(await a).toBe(42)
    expect(await b).toBe(42)
  })

  it('releases the entry once the underlying promise settles', async () => {
    const inflight = createInflight<number>()
    const result = inflight('k', () => Promise.resolve(7))
    expect(inflight.size()).toBe(1)
    await result
    expect(inflight.size()).toBe(0)
  })

  it('releases the entry on rejection too (no permanent stickiness)', async () => {
    const inflight = createInflight<number>()
    const failing = inflight('k', () => Promise.reject(new Error('boom')))
    await expect(failing).rejects.toThrow('boom')
    expect(inflight.size()).toBe(0)
  })

  it('treats different keys as independent', async () => {
    const inflight = createInflight<string>()
    let aRuns = 0
    let bRuns = 0
    await Promise.all([
      inflight('a', async () => {
        aRuns += 1
        return 'A'
      }),
      inflight('b', async () => {
        bRuns += 1
        return 'B'
      }),
    ])
    expect(aRuns).toBe(1)
    expect(bRuns).toBe(1)
  })
})
