import { describe, expect, it, vi } from 'vitest'

import { createBoundedMap, createPromiseMemo } from '@/shared/utils/memo'

describe('createPromiseMemo', () => {
  it('memoizes the resolved value and runs the loader once', async () => {
    const loader = vi.fn(() => Promise.resolve(42))
    const memo = createPromiseMemo(loader)

    expect(await memo()).toBe(42)
    expect(await memo()).toBe(42)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight promise across concurrent callers', async () => {
    let resolveLoader!: (value: string) => void
    const loader = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoader = resolve
        }),
    )
    const memo = createPromiseMemo(loader)

    const first = memo()
    const second = memo()
    expect(first).toBe(second)
    expect(loader).toHaveBeenCalledTimes(1)

    resolveLoader('x')
    await expect(first).resolves.toBe('x')
    await expect(second).resolves.toBe('x')
  })

  it('does not cache a rejection; the next call retries', async () => {
    let attempt = 0
    const loader = vi.fn(() => {
      attempt += 1
      return attempt === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(attempt)
    })
    const memo = createPromiseMemo(loader)

    await expect(memo()).rejects.toThrow('boom')
    expect(await memo()).toBe(2)
    expect(loader).toHaveBeenCalledTimes(2)

    // The retried success is memoized from then on.
    expect(await memo()).toBe(2)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('shares a rejection with concurrent callers, then retries on the next call', async () => {
    const loader = vi.fn(() => Promise.reject(new Error('nope')))
    const memo = createPromiseMemo(loader)

    await expect(Promise.all([memo(), memo()])).rejects.toThrow('nope')
    expect(loader).toHaveBeenCalledTimes(1)

    await expect(memo()).rejects.toThrow('nope')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})

describe('createBoundedMap', () => {
  it('stores and retrieves entries up to the cap', () => {
    const map = createBoundedMap<string, number>(2)
    map.set('a', 1)
    map.set('b', 2)

    expect(map.size).toBe(2)
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
  })

  it('evicts the oldest entry (FIFO) when inserting past the cap', () => {
    const map = createBoundedMap<string, number>(2)
    map.set('a', 1)
    map.set('b', 2)
    map.set('c', 3)

    expect(map.has('a')).toBe(false)
    expect(map.get('b')).toBe(2)
    expect(map.get('c')).toBe(3)
    expect(map.size).toBe(2)
  })

  it('evicts in insertion order across successive overflows', () => {
    const map = createBoundedMap<number, string>(3)
    for (let i = 0; i < 6; i++) {
      map.set(i, `v${i}`)
    }

    expect([...map.keys()]).toEqual([3, 4, 5])
  })

  it('re-setting an existing key updates in place without eviction', () => {
    const map = createBoundedMap<string, number>(2)
    map.set('a', 1)
    map.set('b', 2)
    map.set('a', 10)

    expect(map.get('a')).toBe(10)
    expect(map.has('b')).toBe(true)
    expect([...map.keys()]).toEqual(['a', 'b'])
    expect(map.size).toBe(2)
  })

  it('supports delete and key iteration', () => {
    const map = createBoundedMap<string, number>(4)
    map.set('a', 1)
    map.set('b', 2)

    expect(map.delete('a')).toBe(true)
    expect(map.get('a')).toBeUndefined()
    expect([...map.keys()]).toEqual(['b'])
  })
})
