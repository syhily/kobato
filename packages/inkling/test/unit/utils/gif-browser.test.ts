import { describe, expect, it, vi } from 'vitest'

import type { GifData, GifProviderConfig } from '@/utils/services/gif'

import { tick } from '#/utils/test-editor'
import {
  createGifBrowser,
  reduceGifKey,
  type GifFetchOutcome,
  type GifGeometry,
  type GifKeyEventData,
  type GifKeyTarget,
  type GifNavState,
  type GifScheduler,
  type GifTileRect,
} from '@/utils/services/gif-browser'

const TEST_CONFIG: GifProviderConfig = {
  provider: 'tenor',
  apiUrl: 'https://tenor.googleapis.com',
  apiKey: 'test-key',
  contentFilter: 'off',
}

interface MakeGifOptions {
  dims?: [number, number]
  usable?: boolean
  withGifFormat?: boolean
}

function makeGif(id: string, { dims = [100, 100], usable = true, withGifFormat = true }: MakeGifOptions = {}): GifData {
  if (!usable) {
    return { id, media_formats: {} }
  }
  return {
    id,
    content_description: `gif ${id}`,
    media_formats: {
      tinygif: { url: `https://media.example.com/${id}-tiny.gif`, dims },
      ...(withGifFormat ? { gif: { url: `https://media.example.com/${id}.gif`, dims } } : {}),
    },
  }
}

/** Lay gifs out in columns, assigning the global index / column coordinates. */
function placeColumns(...columns: GifData[][]): { gifs: GifData[]; columns: GifData[][] } {
  const gifs: GifData[] = []
  columns.forEach((column, columnIndex) => {
    column.forEach((gif, columnRowIndex) => {
      gif.index = gifs.length
      gif.columnIndex = columnIndex
      gif.columnRowIndex = columnRowIndex
      gifs.push(gif)
    })
  })
  return { gifs, columns }
}

function keyEvent(
  key: string,
  { shiftKey = false, target = 'other' }: { shiftKey?: boolean; target?: GifKeyTarget } = {},
): GifKeyEventData {
  return { key, shiftKey, target }
}

const nullGeometry: GifGeometry = {
  tileRect: () => null,
  gifIndexAtPoint: () => null,
}

interface FakeGeometry {
  geometry: GifGeometry
  probes: Array<{ x: number; y: number }>
  tileCalls: number[]
}

/** Geometry port stub: one rect for every tile, probe results consumed in order (the last one repeats). */
function createFakeGeometry({
  rect = null,
  probes = [],
}: { rect?: GifTileRect | null; probes?: Array<number | null> } = {}): FakeGeometry {
  const probeCalls: Array<{ x: number; y: number }> = []
  const tileCalls: number[] = []
  const queue = [...probes]
  return {
    probes: probeCalls,
    tileCalls,
    geometry: {
      tileRect(index) {
        tileCalls.push(index)
        return rect
      },
      gifIndexAtPoint(x, y) {
        probeCalls.push({ x, y })
        if (queue.length === 0) {
          return null
        }
        const next = queue.length > 1 ? queue.shift() : queue[0]
        return next ?? null
      },
    },
  }
}

/** a (usable), skip (unusable), b (usable) laid out as [a, skip] [b] — Tab order a, skip, b. */
function skipFixture(): GifNavState {
  const a = makeGif('a')
  const skip = makeGif('skip', { usable: false })
  const b = makeGif('b')
  const { gifs, columns } = placeColumns([a, skip], [b])
  return { gifs, columns, highlightedId: null }
}

/** Single column [top, mid (unusable), bottom]. */
function columnFixture(): GifNavState {
  const top = makeGif('top')
  const mid = makeGif('mid', { usable: false })
  const bottom = makeGif('bottom')
  const { gifs, columns } = placeColumns([top, mid, bottom])
  return { gifs, columns, highlightedId: null }
}

/** Two one-gif columns [left] [right]. */
function horizontalFixture(): GifNavState {
  const left = makeGif('left')
  const right = makeGif('right')
  const { gifs, columns } = placeColumns([left], [right])
  return { gifs, columns, highlightedId: null }
}

const PREVENT_DEFAULT = { type: 'prevent-default' }
const FOCUS_SEARCH = { type: 'focus-search' }

describe('reduceGifKey: valid-gif skipping (Tab / Shift+Tab)', () => {
  it('Tab from the search input highlights the first usable gif', () => {
    const state = skipFixture()
    const { state: next, effects } = reduceGifKey(state, keyEvent('Tab', { target: 'input' }), nullGeometry)

    expect(next.highlightedId).toBe('a')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Tab from the input clears the highlight when no gif is usable', () => {
    const unusable = makeGif('unusable', { usable: false })
    const { gifs, columns } = placeColumns([unusable])
    const { state: next, effects } = reduceGifKey(
      { gifs, columns, highlightedId: 'stale' },
      keyEvent('Tab', { target: 'input' }),
      nullGeometry,
    )

    expect(next.highlightedId).toBeNull()
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Tab moves to the next usable gif, skipping unusable ones', () => {
    const { state: next, effects } = reduceGifKey(
      { ...skipFixture(), highlightedId: 'a' },
      keyEvent('Tab', { target: 'button' }),
      nullGeometry,
    )

    expect(next.highlightedId).toBe('b')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Shift+Tab moves to the previous usable gif, skipping unusable ones', () => {
    const { state: next, effects } = reduceGifKey(
      { ...skipFixture(), highlightedId: 'b' },
      keyEvent('Tab', { shiftKey: true, target: 'button' }),
      nullGeometry,
    )

    expect(next.highlightedId).toBe('a')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Tab on the last usable gif does not wrap', () => {
    const state = { ...skipFixture(), highlightedId: 'b' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('Tab', { target: 'button' }), nullGeometry)

    expect(next.highlightedId).toBe('b')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Shift+Tab on the first gif focuses the search input and keeps the highlight', () => {
    const state = { ...skipFixture(), highlightedId: 'a' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('Tab', { shiftKey: true }), nullGeometry)

    expect(next.highlightedId).toBe('a')
    expect(effects).toEqual([PREVENT_DEFAULT, FOCUS_SEARCH])
  })

  it('Shift+Tab without a highlight is a no-op', () => {
    const state = skipFixture()
    const { state: next, effects } = reduceGifKey(state, keyEvent('Tab', { shiftKey: true }), nullGeometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  it('Tab without a highlight and not on the input is a no-op', () => {
    const state = skipFixture()
    const { state: next, effects } = reduceGifKey(state, keyEvent('Tab', { target: 'other' }), nullGeometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })
})

describe('reduceGifKey: column walking (ArrowUp / ArrowDown)', () => {
  it('ArrowDown from the search input highlights the first usable gif', () => {
    const { state: next, effects } = reduceGifKey(
      columnFixture(),
      keyEvent('ArrowDown', { target: 'input' }),
      nullGeometry,
    )

    expect(next.highlightedId).toBe('top')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('ArrowDown walks down the column, skipping unusable rows', () => {
    const { state: next, effects } = reduceGifKey(
      { ...columnFixture(), highlightedId: 'top' },
      keyEvent('ArrowDown', { target: 'button' }),
      nullGeometry,
    )

    expect(next.highlightedId).toBe('bottom')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('ArrowDown at the bottom of the column keeps the highlight', () => {
    const state = { ...columnFixture(), highlightedId: 'bottom' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowDown'), nullGeometry)

    expect(next.highlightedId).toBe('bottom')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('ArrowUp walks up the column, skipping unusable rows', () => {
    const { state: next, effects } = reduceGifKey(
      { ...columnFixture(), highlightedId: 'bottom' },
      keyEvent('ArrowUp'),
      nullGeometry,
    )

    expect(next.highlightedId).toBe('top')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('ArrowUp at the top of the column focuses the search input and keeps the highlight', () => {
    const state = { ...columnFixture(), highlightedId: 'top' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowUp'), nullGeometry)

    expect(next.highlightedId).toBe('top')
    expect(effects).toEqual([PREVENT_DEFAULT, FOCUS_SEARCH])
  })

  it('ArrowUp without a highlight is a no-op, even on the input', () => {
    const state = columnFixture()
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowUp', { target: 'input' }), nullGeometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })
})

describe('reduceGifKey: horizontal moves via the geometry port', () => {
  const rect: GifTileRect = { left: 100, right: 200, top: 60, width: 100, height: 90 }

  it('ArrowRight probes to the right of the tile and highlights the hit', () => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect, probes: [1] })
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowRight'), fake.geometry)

    expect(next.highlightedId).toBe('right')
    expect(effects).toEqual([PREVENT_DEFAULT])
    // probing starts to the right of the tile, one third of its height down
    expect(fake.probes).toEqual([{ x: 250, y: 90 }])
    expect(fake.tileCalls).toEqual([0])
  })

  it('ArrowRight on the last column does not probe', () => {
    const state = { ...horizontalFixture(), highlightedId: 'right' }
    const fake = createFakeGeometry({ rect, probes: [0] })
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowRight'), fake.geometry)

    expect(next.highlightedId).toBe('right')
    expect(effects).toEqual([PREVENT_DEFAULT])
    expect(fake.tileCalls).toEqual([])
    expect(fake.probes).toEqual([])
  })

  it.each(['ArrowLeft', 'ArrowRight'])('%s on the search input is a no-op, even with a highlight', (key) => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect, probes: [1] })
    const { state: next, effects } = reduceGifKey(state, keyEvent(key, { target: 'input' }), fake.geometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
    expect(fake.probes).toEqual([])
  })

  it('ArrowLeft on the first gif focuses the search input', () => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect, probes: [1] })
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowLeft'), fake.geometry)

    expect(next.highlightedId).toBe('left')
    expect(effects).toEqual([PREVENT_DEFAULT, FOCUS_SEARCH])
    expect(fake.probes).toEqual([])
  })

  it('ArrowLeft on the first column (but not the first gif) does not probe', () => {
    const a = makeGif('a')
    const b = makeGif('b')
    const c = makeGif('c')
    const { gifs, columns } = placeColumns([a, b], [c])
    const fake = createFakeGeometry({ rect, probes: [2] })
    const { state: next, effects } = reduceGifKey(
      { gifs, columns, highlightedId: 'b' },
      keyEvent('ArrowLeft'),
      fake.geometry,
    )

    expect(next.highlightedId).toBe('b')
    expect(effects).toEqual([PREVENT_DEFAULT])
    expect(fake.probes).toEqual([])
  })

  it('ArrowLeft probes to the left of the tile and highlights the hit', () => {
    const state = { ...horizontalFixture(), highlightedId: 'right' }
    const fake = createFakeGeometry({ rect, probes: [0] })
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowLeft'), fake.geometry)

    expect(next.highlightedId).toBe('left')
    expect(effects).toEqual([PREVENT_DEFAULT])
    expect(fake.probes).toEqual([{ x: 50, y: 90 }])
  })

  it('probing retries in 5px steps until a tile is hit', () => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect, probes: [null, null, null, 1] })
    const { state: next } = reduceGifKey(state, keyEvent('ArrowRight'), fake.geometry)

    expect(next.highlightedId).toBe('right')
    expect(fake.probes).toEqual([
      { x: 250, y: 90 },
      { x: 250, y: 85 },
      { x: 250, y: 80 },
      { x: 250, y: 75 },
    ])
  })

  it('probing gives up after ten retries', () => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect, probes: [null] })
    const { state: next } = reduceGifKey(state, keyEvent('ArrowRight'), fake.geometry)

    expect(next.highlightedId).toBe('left')
    expect(fake.probes).toHaveLength(11)
  })

  it('probing a tile without usable media keeps the highlight', () => {
    const left = makeGif('left')
    const broken = makeGif('broken', { usable: false })
    const { gifs, columns } = placeColumns([left], [broken])
    const fake = createFakeGeometry({ rect, probes: [1] })
    const { state: next, effects } = reduceGifKey(
      { gifs, columns, highlightedId: 'left' },
      keyEvent('ArrowRight'),
      fake.geometry,
    )

    expect(next.highlightedId).toBe('left')
    expect(effects).toEqual([PREVENT_DEFAULT])
    expect(fake.probes).toHaveLength(1)
  })

  it('probing without a tile rect does nothing', () => {
    const state = { ...horizontalFixture(), highlightedId: 'left' }
    const fake = createFakeGeometry({ rect: null, probes: [1] })
    const { state: next, effects } = reduceGifKey(state, keyEvent('ArrowRight'), fake.geometry)

    expect(next.highlightedId).toBe('left')
    expect(effects).toEqual([PREVENT_DEFAULT])
    expect(fake.tileCalls).toEqual([0])
    expect(fake.probes).toEqual([])
  })
})

describe('reduceGifKey: Enter dispatch', () => {
  it('Enter on the search input highlights the first usable gif', () => {
    const { state: next, effects } = reduceGifKey(skipFixture(), keyEvent('Enter', { target: 'input' }), nullGeometry)

    expect(next.highlightedId).toBe('a')
    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Enter on a tile button is left to native activation', () => {
    const state = { ...skipFixture(), highlightedId: 'a' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('Enter', { target: 'button' }), nullGeometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  it('Enter inserts the highlighted gif using the full gif format', () => {
    const gif = makeGif('a', { dims: [120, 80] })
    const { gifs, columns } = placeColumns([gif])
    const { effects } = reduceGifKey({ gifs, columns, highlightedId: 'a' }, keyEvent('Enter'), nullGeometry)

    expect(effects).toEqual([
      PREVENT_DEFAULT,
      { type: 'insert', image: { src: 'https://media.example.com/a.gif', width: 120, height: 80 } },
    ])
  })

  it('Enter on a highlighted gif without the gif format does not insert', () => {
    const gif = makeGif('tiny-only', { withGifFormat: false })
    const { gifs, columns } = placeColumns([gif])
    const { effects } = reduceGifKey({ gifs, columns, highlightedId: 'tiny-only' }, keyEvent('Enter'), nullGeometry)

    expect(effects).toEqual([PREVENT_DEFAULT])
  })

  it('Enter without a highlight is a no-op', () => {
    const state = skipFixture()
    const { effects } = reduceGifKey(state, keyEvent('Enter'), nullGeometry)

    expect(effects).toEqual([])
  })
})

describe('reduceGifKey: dispatch table edges', () => {
  it('ignores unknown keys', () => {
    const state = { ...skipFixture(), highlightedId: 'a' }
    const { state: next, effects } = reduceGifKey(state, keyEvent('x'), nullGeometry)

    expect(next).toBe(state)
    expect(effects).toEqual([])
  })

  it('ignores arrow keys without a highlight', () => {
    const state = skipFixture()
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      const { state: next, effects } = reduceGifKey(state, keyEvent(key, { target: 'other' }), nullGeometry)
      expect(next).toBe(state)
      expect(effects).toEqual([])
    }
  })

  it('prevents default even when the move itself is a no-op', () => {
    // ArrowRight with a highlight but no columns at all: swallowed, no move
    const gif = makeGif('a')
    gif.index = 0
    gif.columnIndex = 0
    gif.columnRowIndex = 0
    const { effects } = reduceGifKey(
      { gifs: [gif], columns: [], highlightedId: 'a' },
      keyEvent('ArrowRight'),
      nullGeometry,
    )

    expect(effects).toEqual([PREVENT_DEFAULT])
  })
})

interface ManualScheduler extends GifScheduler {
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

function pageOutcome(gifs: GifData[], next: string | null = null): GifFetchOutcome {
  return { ok: true, results: gifs, next }
}

function setup({ fetchPage }: { fetchPage: (url: string) => Promise<GifFetchOutcome> }) {
  const scheduler = createManualScheduler()
  const browser = createGifBrowser({ config: TEST_CONFIG, fetchPage, scheduler })
  return { browser, scheduler }
}

describe('createGifBrowser: search track', () => {
  it('debounces search terms and hits the search endpoint', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cat' })
    browser.dispatch({ type: 'search', term: 'cats' })
    expect(fetchPage).not.toHaveBeenCalled()

    scheduler.flush()
    await tick()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    const url = new URL(fetchPage.mock.calls[0][0])
    expect(url.pathname).toBe('/v2/search')
    expect(url.searchParams.get('q')).toBe('cats')
    expect(url.searchParams.get('media_filter')).toBe('tinygif,gif')
    expect(url.searchParams.get('key')).toBe('test-key')
    expect(url.searchParams.get('client_key')).toBe('inkling-editor')
    expect(url.searchParams.get('contentfilter')).toBe('off')
  })

  it('schedules searches with the 600ms debounce', () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const schedule = vi.fn<GifScheduler['schedule']>(() => () => {})
    const browser = createGifBrowser({ config: TEST_CONFIG, fetchPage, scheduler: { schedule } })

    browser.dispatch({ type: 'search', term: 'cat' })

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 600)
    browser.dispose()
  })

  it('an empty search term fetches the featured endpoint', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    const url = new URL(fetchPage.mock.calls[0][0])
    expect(url.pathname).toBe('/v2/featured')
    expect(url.searchParams.get('q')).toBe('excited')
  })

  it('passes a configured content filter through', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const scheduler = createManualScheduler()
    const browser = createGifBrowser({
      config: { ...TEST_CONFIG, contentFilter: 'high' },
      fetchPage,
      scheduler,
    })

    browser.dispatch({ type: 'search', term: 'cat' })
    scheduler.flush()
    await tick()

    const url = new URL(fetchPage.mock.calls[0][0])
    expect(url.searchParams.get('contentfilter')).toBe('high')
    browser.dispose()
  })
})

describe('createGifBrowser: pages and columns', () => {
  it('applies fetched pages: global indices and ratio-balanced columns', async () => {
    const gifs = [
      makeGif('g0', { dims: [100, 200] }),
      makeGif('g1', { dims: [100, 100] }),
      makeGif('g2', { dims: [100, 100] }),
      makeGif('g3', { dims: [100, 100] }),
    ]
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome(gifs)))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    const snapshot = browser.getSnapshot()
    expect(snapshot.gifs.map((gif) => gif.index)).toEqual([0, 1, 2, 3])
    // default 4 columns: one gif each
    expect(snapshot.columns.map((column) => column.map((gif) => gif.id))).toEqual([['g0'], ['g1'], ['g2'], ['g3']])
    expect(snapshot.isLoading).toBe(false)
    expect(snapshot.error).toBeNull()

    // rebalance into 2 columns: heights 600/300/300/300 greedy by min height
    browser.dispatch({ type: 'set-column-count', count: 2 })
    const rebalanced = browser.getSnapshot()
    expect(rebalanced.columns.map((column) => column.map((gif) => gif.id))).toEqual([
      ['g0', 'g3'],
      ['g1', 'g2'],
    ])
    expect(rebalanced.gifs.map((gif) => [gif.columnIndex, gif.columnRowIndex])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
  })

  it('treats gifs without tinygif dims as ratio 1, never deriving it from the gif format', async () => {
    // g0 has no tinygif; its gif format is tall (ratio 4), which must not leak
    // into the column height (ratio 1 => 300px, so g2 balances onto column 0)
    const g0: GifData = {
      id: 'g0',
      media_formats: { gif: { url: 'https://media.example.com/g0.gif', dims: [100, 400] } },
    }
    const g1 = makeGif('g1')
    const g2 = makeGif('g2')
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([g0, g1, g2])))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'set-column-count', count: 2 })
    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().columns.map((column) => column.map((gif) => gif.id))).toEqual([['g0', 'g2'], ['g1']])
  })

  it('paginates with the cursor, appends with global indices, and keeps balancing', async () => {
    const first = deferred<GifFetchOutcome>()
    const second = deferred<GifFetchOutcome>()
    const fetchPage = vi
      .fn<(url: string) => Promise<GifFetchOutcome>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    first.resolve(pageOutcome([makeGif('a'), makeGif('b')], 'cursor-2'))
    await tick()

    expect(browser.getSnapshot().gifs.map((gif) => gif.id)).toEqual(['a', 'b'])

    browser.dispatch({ type: 'load-more' })
    // the lazy flags flip synchronously with the dispatch
    expect(browser.getSnapshot().isLoading).toBe(true)
    expect(browser.getSnapshot().isLazyLoading).toBe(true)

    expect(fetchPage).toHaveBeenCalledTimes(2)
    const url = new URL(fetchPage.mock.calls[1][0])
    expect(url.pathname).toBe('/v2/search')
    expect(url.searchParams.get('q')).toBe('cats')
    expect(url.searchParams.get('pos')).toBe('cursor-2')

    second.resolve(pageOutcome([makeGif('c'), makeGif('d')]))
    await tick()

    const snapshot = browser.getSnapshot()
    expect(snapshot.gifs.map((gif) => gif.id)).toEqual(['a', 'b', 'c', 'd'])
    // page-2 gifs continue the global index sequence
    expect(snapshot.gifs.map((gif) => gif.index)).toEqual([0, 1, 2, 3])
    expect(snapshot.isLoading).toBe(false)
    expect(snapshot.isLazyLoading).toBe(false)
  })

  it('paginates the featured track without re-sending a query', async () => {
    const first = deferred<GifFetchOutcome>()
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>().mockImplementationOnce(() => first.promise)
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    first.resolve(pageOutcome([makeGif('a')], 'cursor-2'))
    await tick()

    browser.dispatch({ type: 'load-more' })

    const url = new URL(fetchPage.mock.calls[1][0])
    expect(url.pathname).toBe('/v2/featured')
    expect(url.searchParams.get('pos')).toBe('cursor-2')
    expect(url.searchParams.get('q')).toBeNull()
    browser.dispose()
  })

  it('ignores load-more while a request is in flight', async () => {
    const pending = deferred<GifFetchOutcome>()
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => pending.promise)
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    browser.dispatch({ type: 'load-more' })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    browser.dispose()
  })

  it('ignores load-more when there is no next page', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() =>
      Promise.resolve(pageOutcome([makeGif('a')], null)),
    )
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    browser.dispatch({ type: 'load-more' })
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('load-more with an empty list fetches the featured page immediately', () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const { browser } = setup({ fetchPage })

    browser.dispatch({ type: 'load-more' })

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(new URL(fetchPage.mock.calls[0][0]).pathname).toBe('/v2/featured')
    browser.dispose()
  })

  it('ignores a column-count change to the same count', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome([])))
    const { browser, scheduler } = setup({ fetchPage })
    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    const listener = vi.fn()
    browser.subscribe(listener)
    browser.dispatch({ type: 'set-column-count', count: 4 })

    expect(listener).not.toHaveBeenCalled()
  })

  it('clamps a zero or negative column count to one, so adding gifs never crashes', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() =>
      Promise.resolve(pageOutcome([makeGif('g0'), makeGif('g1')])),
    )
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'set-column-count', count: 0 })
    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().columns.map((column) => column.map((gif) => gif.id))).toEqual([['g0', 'g1']])

    browser.dispatch({ type: 'set-column-count', count: -3 })
    expect(browser.getSnapshot().columns.map((column) => column.map((gif) => gif.id))).toEqual([['g0', 'g1']])
  })
})

describe('createGifBrowser: loading and error states', () => {
  it('exposes the loading lifecycle of a search', async () => {
    const pending = deferred<GifFetchOutcome>()
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => pending.promise)
    const { browser, scheduler } = setup({ fetchPage })

    expect(browser.getSnapshot().isLoading).toBe(false)

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()

    expect(browser.getSnapshot().isLoading).toBe(true)
    expect(browser.getSnapshot().isLazyLoading).toBe(false)
    expect(browser.getSnapshot().error).toBeNull()

    pending.resolve(pageOutcome([makeGif('a')]))
    await tick()

    expect(browser.getSnapshot().isLoading).toBe(false)
    expect(browser.getSnapshot().gifs).toHaveLength(1)
  })

  it('maps an invalid-key failure to the typed error', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() =>
      Promise.resolve({ ok: false, message: 'API key not valid' }),
    )
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().error).toBe('invalid_key')
    expect(browser.getSnapshot().isLoading).toBe(false)
  })

  it('maps a generic failure to the common error and clears it on the next request', async () => {
    const fetchPage = vi
      .fn<(url: string) => Promise<GifFetchOutcome>>()
      .mockImplementationOnce(() => Promise.resolve({ ok: false, message: 'boom' }))
      .mockImplementationOnce(() => Promise.resolve(pageOutcome([makeGif('a')])))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()
    expect(browser.getSnapshot().error).toBe('common')

    browser.dispatch({ type: 'search', term: 'dogs' })
    scheduler.flush()
    // the error clears when the next request starts
    expect(browser.getSnapshot().error).toBeNull()
    await tick()
    expect(browser.getSnapshot().error).toBeNull()
    expect(browser.getSnapshot().gifs).toHaveLength(1)
  })

  it('maps a rejected fetch to the typed errors by message', async () => {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() =>
      Promise.reject(new Error('The provided API key is invalid')),
    )
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    scheduler.flush()
    await tick()

    expect(browser.getSnapshot().error).toBe('invalid_key')
  })
})

describe('createGifBrowser: races and lifecycle', () => {
  it('a stale response never overwrites a newer search', async () => {
    const first = deferred<GifFetchOutcome>()
    const second = deferred<GifFetchOutcome>()
    const fetchPage = vi
      .fn<(url: string) => Promise<GifFetchOutcome>>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'first' })
    scheduler.flush()
    browser.dispatch({ type: 'search', term: 'second' })
    scheduler.flush()

    // the newer response lands first
    second.resolve(pageOutcome([makeGif('new')]))
    await tick()
    expect(browser.getSnapshot().gifs.map((gif) => gif.id)).toEqual(['new'])

    // the older response lands late and must be dropped
    first.resolve(pageOutcome([makeGif('stale')]))
    await tick()
    expect(browser.getSnapshot().gifs.map((gif) => gif.id)).toEqual(['new'])
    expect(browser.getSnapshot().isLoading).toBe(false)
  })

  it('keeps the highlight by id across a list swap and clears it when the gif is gone', async () => {
    const fetchPage = vi
      .fn<(url: string) => Promise<GifFetchOutcome>>()
      .mockImplementationOnce(() => Promise.resolve(pageOutcome([makeGif('a'), makeGif('b')])))
      .mockImplementationOnce(() => Promise.resolve(pageOutcome([makeGif('b'), makeGif('c')])))
      .mockImplementationOnce(() => Promise.resolve(pageOutcome([makeGif('d')])))
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'one' })
    scheduler.flush()
    await tick()

    browser.dispatch({ type: 'highlight', id: 'b' })
    expect(browser.getSnapshot().highlightedId).toBe('b')

    browser.dispatch({ type: 'search', term: 'two' })
    scheduler.flush()
    // the highlight survives the in-flight window, like the old sync effect
    expect(browser.getSnapshot().highlightedId).toBe('b')
    await tick()
    // the new list still holds a gif with id b — the highlight stays
    expect(browser.getSnapshot().highlightedId).toBe('b')

    browser.dispatch({ type: 'search', term: 'three' })
    scheduler.flush()
    await tick()
    expect(browser.getSnapshot().highlightedId).toBeNull()
  })

  it('dispose cancels a pending search and ignores late responses', async () => {
    const pending = deferred<GifFetchOutcome>()
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => pending.promise)
    const { browser, scheduler } = setup({ fetchPage })

    browser.dispatch({ type: 'search', term: 'cats' })
    browser.dispose()
    scheduler.flush()
    expect(fetchPage).not.toHaveBeenCalled()

    browser.dispatch({ type: 'search', term: 'dogs' })
    scheduler.flush()
    expect(fetchPage).toHaveBeenCalledTimes(1)

    browser.dispose()
    pending.resolve(pageOutcome([makeGif('late')]))
    await tick()
    expect(browser.getSnapshot().gifs).toEqual([])
    expect(browser.getSnapshot().isLoading).toBe(true)
  })
})

describe('createGifBrowser: highlight, select, and key intents', () => {
  async function loadedBrowser(gifs: GifData[]) {
    const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(() => Promise.resolve(pageOutcome(gifs)))
    const { browser, scheduler } = setup({ fetchPage })
    browser.dispatch({ type: 'search', term: '' })
    scheduler.flush()
    await tick()
    return browser
  }

  it('highlight intent emits only for a real change to a known id', async () => {
    const browser = await loadedBrowser([makeGif('a')])
    const listener = vi.fn()
    browser.subscribe(listener)

    expect(browser.dispatch({ type: 'highlight', id: 'missing' })).toEqual([])
    expect(listener).not.toHaveBeenCalled()

    expect(browser.dispatch({ type: 'highlight', id: 'a' })).toEqual([])
    expect(listener).toHaveBeenCalledTimes(1)
    expect(browser.getSnapshot().highlightedId).toBe('a')

    browser.dispatch({ type: 'highlight', id: 'a' })
    expect(listener).toHaveBeenCalledTimes(1)
    browser.dispose()
  })

  it('select intent returns the insert image for the gif format only', async () => {
    const full = makeGif('full', { dims: [120, 80] })
    const tinyOnly = makeGif('tiny-only', { withGifFormat: false })
    const browser = await loadedBrowser([full, tinyOnly])

    expect(browser.dispatch({ type: 'select', id: 'full' })).toEqual([
      { type: 'insert', image: { src: 'https://media.example.com/full.gif', width: 120, height: 80 } },
    ])
    expect(browser.dispatch({ type: 'select', id: 'tiny-only' })).toEqual([])
    expect(browser.dispatch({ type: 'select', id: 'missing' })).toEqual([])
    browser.dispose()
  })

  it('key intents reduce over the browser state and publish highlight changes', async () => {
    const browser = await loadedBrowser([makeGif('a'), makeGif('b')])
    const listener = vi.fn()
    browser.subscribe(listener)

    const firstEffects = browser.dispatch({ type: 'key', key: 'Tab', shiftKey: false, target: 'input' })
    expect(firstEffects).toEqual([PREVENT_DEFAULT])
    expect(browser.getSnapshot().highlightedId).toBe('a')
    expect(listener).toHaveBeenCalledTimes(1)

    const nextEffects = browser.dispatch({ type: 'key', key: 'Tab', shiftKey: false, target: 'button' })
    expect(nextEffects).toEqual([PREVENT_DEFAULT])
    expect(browser.getSnapshot().highlightedId).toBe('b')
    expect(listener).toHaveBeenCalledTimes(2)

    // a no-op move publishes nothing
    browser.dispatch({ type: 'key', key: 'Tab', shiftKey: false, target: 'button' })
    expect(listener).toHaveBeenCalledTimes(2)

    // two gifs land in separate columns, so ArrowUp runs off the top
    const upEffects = browser.dispatch({ type: 'key', key: 'ArrowUp', shiftKey: false, target: 'button' })
    expect(upEffects).toEqual([PREVENT_DEFAULT, FOCUS_SEARCH])
    browser.dispose()
  })
})
