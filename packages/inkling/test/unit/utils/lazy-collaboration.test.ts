import { describe, expect, it, vi } from 'vitest'

import type { LexicalProviderFactory } from '@/context/InklingCollaborationContext'

import { createLazyProviderFactory, type CollaborationChunk } from '@/utils/services/lazy-collaboration'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function fakeChunk(): CollaborationChunk {
  return {
    createWebsocketProviderFactory: () => vi.fn() as unknown as LexicalProviderFactory,
  }
}

describe('createLazyProviderFactory', () => {
  it('applies the chunk factory when the load resolves', async () => {
    const load = deferred<CollaborationChunk>()
    const session = createLazyProviderFactory(() => load.promise)
    const apply = vi.fn()

    session.start(apply)
    expect(apply).not.toHaveBeenCalled()

    load.resolve(fakeChunk())
    await load.promise
    await Promise.resolve()

    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('never applies a load cancelled while in flight', async () => {
    const load = deferred<CollaborationChunk>()
    const session = createLazyProviderFactory(() => load.promise)
    const apply = vi.fn()

    session.start(apply)
    session.cancel()
    load.resolve(fakeChunk())
    await load.promise
    await Promise.resolve()

    expect(apply).not.toHaveBeenCalled()
  })

  it('a restart supersedes the older in-flight load even when it resolves first', async () => {
    const first = deferred<CollaborationChunk>()
    const second = deferred<CollaborationChunk>()
    const loads = [first, second]
    const session = createLazyProviderFactory(() => loads.shift()!.promise)
    const applyFirst = vi.fn()
    const applySecond = vi.fn()

    session.start(applyFirst)
    session.start(applySecond)

    first.resolve(fakeChunk())
    await first.promise
    await Promise.resolve()
    expect(applyFirst).not.toHaveBeenCalled()

    second.resolve(fakeChunk())
    await second.promise
    await Promise.resolve()
    expect(applySecond).toHaveBeenCalledTimes(1)
  })

  it('a slow older load never applies after a newer one resolved', async () => {
    const first = deferred<CollaborationChunk>()
    const second = deferred<CollaborationChunk>()
    const loads = [first, second]
    const session = createLazyProviderFactory(() => loads.shift()!.promise)
    const applyFirst = vi.fn()
    const applySecond = vi.fn()

    session.start(applyFirst)
    session.start(applySecond)

    second.resolve(fakeChunk())
    await second.promise
    await Promise.resolve()

    first.resolve(fakeChunk())
    await first.promise
    await Promise.resolve()

    expect(applySecond).toHaveBeenCalledTimes(1)
    expect(applyFirst).not.toHaveBeenCalled()
  })

  it('a failed load stays inert and never rejects unhandled', async () => {
    const session = createLazyProviderFactory(() => Promise.reject(new Error('chunk load failed')))
    const apply = vi.fn()
    const onUnhandled = vi.fn()
    process.on('unhandledRejection', onUnhandled)

    try {
      session.start(apply)
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
      await Promise.resolve()

      expect(apply).not.toHaveBeenCalled()
      expect(onUnhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })
})
