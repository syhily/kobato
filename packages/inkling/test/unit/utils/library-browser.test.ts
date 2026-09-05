import { describe, expect, it, vi } from 'vitest'

import { tick } from '#/utils/test-editor'
import {
  createLibraryBrowser,
  LIBRARY_SEARCH_DEBOUNCE_MS,
  type LibraryScheduler,
} from '@/utils/services/library-browser'

interface TestItem {
  id: string
}

function makeItem(id: string): TestItem {
  return { id }
}

interface ManualScheduler extends LibraryScheduler {
  flush: () => void
  pendingCount: () => number
}

function createManualScheduler(): ManualScheduler {
  const pending: Array<{ fn: () => void; cancelled: boolean }> = []
  return {
    schedule(fn) {
      const entry = { fn, cancelled: false }
      pending.push(entry)
      return () => {
        entry.cancelled = true
      }
    },
    flush() {
      const due = pending.splice(0)
      for (const entry of due) {
        if (!entry.cancelled) {
          entry.fn()
        }
      }
    },
    pendingCount: () => pending.filter((entry) => !entry.cancelled).length,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function setup({ search }: { search: (query: string) => Promise<TestItem[] | undefined> }) {
  const scheduler = createManualScheduler()
  const browser = createLibraryBrowser<TestItem>({ search, scheduler })
  return { browser, scheduler }
}

describe('createLibraryBrowser: search track', () => {
  it('fires an empty term immediately as the default listing', async () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([makeItem('a')]))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: '' })

    // no scheduler round-trip: the request is already in flight
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('')
    expect(scheduler.pendingCount()).toBe(0)
    expect(browser.getSnapshot().isLoading).toBe(true)

    await tick()
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['a'])
    expect(browser.getSnapshot().isLoading).toBe(false)
    expect(browser.getSnapshot().error).toBeNull()
    browser.dispose()
  })

  it('debounces non-empty terms and searches only the latest', async () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([]))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: 'cat' })
    browser.dispatch({ type: 'search', term: 'cats' })
    expect(search).not.toHaveBeenCalled()

    scheduler.flush()
    await tick()

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('cats')
    browser.dispose()
  })

  it('schedules non-empty searches with the 300ms debounce', () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([]))
    const schedule = vi.fn<LibraryScheduler['schedule']>(() => () => {})
    const browser = createLibraryBrowser<TestItem>({ search, scheduler: { schedule } })

    browser.dispatch({ type: 'search', term: 'cat' })

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), LIBRARY_SEARCH_DEBOUNCE_MS)
    expect(LIBRARY_SEARCH_DEBOUNCE_MS).toBe(300)
    browser.dispose()
  })

  it('honours a custom debounce', () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([]))
    const schedule = vi.fn<LibraryScheduler['schedule']>(() => () => {})
    const browser = createLibraryBrowser<TestItem>({ search, scheduler: { schedule }, debounceMs: 25 })

    browser.dispatch({ type: 'search', term: 'cat' })

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 25)
    browser.dispose()
  })

  it('an empty term cancels a pending debounced search and fires immediately', async () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([]))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: 'cats' })
    expect(scheduler.pendingCount()).toBe(1)

    browser.dispatch({ type: 'search', term: '' })
    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith('')

    scheduler.flush()
    await tick()
    expect(search).toHaveBeenCalledTimes(1)
    browser.dispose()
  })

  it('exposes the loading lifecycle of a search and clears a previous error on the next request', async () => {
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockImplementationOnce(() => Promise.resolve([makeItem('a')]))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()
    expect(browser.getSnapshot().error).toBe('boom')

    browser.dispatch({ type: 'search', term: 'dogs' })
    scheduler.flush()
    // the error clears when the next request starts
    expect(browser.getSnapshot().error).toBeNull()
    expect(browser.getSnapshot().isLoading).toBe(true)

    await tick()
    expect(browser.getSnapshot().error).toBeNull()
    expect(browser.getSnapshot().isLoading).toBe(false)
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['a'])
    browser.dispose()
  })
})

describe('createLibraryBrowser: races and outcomes', () => {
  it('a stale response never overwrites a newer search (latest-wins)', async () => {
    const first = deferred<TestItem[] | undefined>()
    const second = deferred<TestItem[] | undefined>()
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: 'first' })
    scheduler.flush()
    browser.dispatch({ type: 'search', term: 'second' })
    scheduler.flush()

    // the newer response lands first
    second.resolve([makeItem('new')])
    await tick()
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['new'])

    // the older response lands late and must be dropped
    first.resolve([makeItem('stale')])
    await tick()
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['new'])
    expect(browser.getSnapshot().isLoading).toBe(false)
    browser.dispose()
  })

  it('a rejection keeps the last items and sets the error', async () => {
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => Promise.resolve([makeItem('a')]))
      .mockImplementationOnce(() => Promise.reject(new Error('offline')))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: '' })
    await tick()
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['a'])

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()

    const snapshot = browser.getSnapshot()
    expect(snapshot.items.map((item) => item.id)).toEqual(['a'])
    expect(snapshot.error).toBe('offline')
    expect(snapshot.isLoading).toBe(false)
    browser.dispose()
  })

  it('maps a non-Error rejection to a generic message', async () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.reject('nope'))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().error).toBe('Unknown error')
    browser.dispose()
  })

  it('an undefined resolve is a cancellation: items stay untouched', async () => {
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => Promise.resolve([makeItem('a')]))
      .mockImplementationOnce(() => Promise.resolve(undefined))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: '' })
    await tick()
    expect(browser.getSnapshot().items.map((item) => item.id)).toEqual(['a'])

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()

    const snapshot = browser.getSnapshot()
    expect(snapshot.items.map((item) => item.id)).toEqual(['a'])
    expect(snapshot.error).toBeNull()
    expect(snapshot.isLoading).toBe(false)
    browser.dispose()
  })

  it('an empty list resolve replaces the items', async () => {
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => Promise.resolve([makeItem('a')]))
      .mockImplementationOnce(() => Promise.resolve([]))
    const { browser, scheduler } = setup({ search })

    browser.dispatch({ type: 'search', term: '' })
    await tick()

    browser.dispatch({ type: 'search', term: 'nothing-matches' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().items).toEqual([])
    expect(browser.getSnapshot().error).toBeNull()
    browser.dispose()
  })
})

describe('createLibraryBrowser: lifecycle', () => {
  it('publishes snapshot changes to subscribers and unsubscribes cleanly', async () => {
    const search = vi.fn<(query: string) => Promise<TestItem[] | undefined>>(() => Promise.resolve([makeItem('a')]))
    const { browser } = setup({ search })

    const listener = vi.fn()
    const unsubscribe = browser.subscribe(listener)

    browser.dispatch({ type: 'search', term: '' })
    expect(listener).toHaveBeenCalledTimes(1) // loading flip
    await tick()
    expect(listener).toHaveBeenCalledTimes(2) // results

    unsubscribe()
    browser.dispatch({ type: 'search', term: '' })
    await tick()
    expect(listener).toHaveBeenCalledTimes(2)
    browser.dispose()
  })

  it('dispose cancels a pending search and leaves in-flight responses inert', async () => {
    const pending = deferred<TestItem[] | undefined>()
    const search = vi
      .fn<(query: string) => Promise<TestItem[] | undefined>>()
      .mockImplementationOnce(() => pending.promise)
      .mockImplementationOnce(() => Promise.resolve([makeItem('later')]))
    const { browser, scheduler } = setup({ search })

    // a scheduled search never fires after dispose
    browser.dispatch({ type: 'search', term: 'cats' })
    browser.dispose()
    scheduler.flush()
    expect(search).not.toHaveBeenCalled()

    // an in-flight response landing after dispose is dropped
    browser.dispatch({ type: 'search', term: '' })
    expect(search).toHaveBeenCalledTimes(1)
    browser.dispose()
    pending.resolve([makeItem('late')])
    await tick()
    expect(browser.getSnapshot().items).toEqual([])
  })
})
