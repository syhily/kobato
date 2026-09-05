import { describe, expect, it, vi } from 'vitest'

import { createSnapshotStore } from '@/utils/services/snapshot-store'

describe('createSnapshotStore', () => {
  it('merges partials, keeps untouched fields, and notifies listeners', () => {
    const store = createSnapshotStore({ items: [1], isLoading: false, error: null as string | null })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.emit({ isLoading: true })
    expect(store.getSnapshot()).toEqual({ items: [1], isLoading: true, error: null })
    expect(listener).toHaveBeenCalledTimes(1)

    store.emit({ error: 'boom', isLoading: false })
    expect(store.getSnapshot()).toEqual({ items: [1], isLoading: false, error: 'boom' })
    expect(listener).toHaveBeenCalledTimes(2)

    // each emit publishes a fresh snapshot reference (useSyncExternalStore)
    const before = store.getSnapshot()
    store.emit({ isLoading: true })
    expect(store.getSnapshot()).not.toBe(before)

    unsubscribe()
    store.emit({ items: [] })
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('passes the new snapshot to listeners (a () => void listener ignores it)', () => {
    const store = createSnapshotStore({ count: 0 })
    const listener = vi.fn()
    store.subscribe(listener)

    store.emit({ count: 1 })

    expect(listener).toHaveBeenCalledWith({ count: 1 })
  })

  it('swallows emits the change guard rejects — state stays, no notification', () => {
    const store = createSnapshotStore(
      { count: 0, label: 'a' },
      { changeGuard: (previous, next) => previous.count !== next.count },
    )
    const listener = vi.fn()
    store.subscribe(listener)
    const before = store.getSnapshot()

    store.emit({ label: 'b' })
    expect(store.getSnapshot()).toBe(before)
    expect(listener).not.toHaveBeenCalled()

    store.emit({ count: 1 })
    expect(store.getSnapshot()).toEqual({ count: 1, label: 'a' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('dispose drops every listener but keeps the store usable (StrictMode remount re-subscribes)', () => {
    const store = createSnapshotStore({ count: 0 })
    const listener = vi.fn()
    store.subscribe(listener)

    store.dispose()
    store.emit({ count: 1 })
    expect(listener).not.toHaveBeenCalled()
    // the snapshot itself still moves — a late emit is a no-op only for listeners
    expect(store.getSnapshot()).toEqual({ count: 1 })

    // a reused instance re-subscribes and keeps receiving emits
    store.subscribe(listener)
    store.emit({ count: 2 })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ count: 2 })
  })
})
