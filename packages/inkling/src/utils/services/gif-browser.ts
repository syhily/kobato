import {
  ERROR_TYPE,
  extractErrorMessage,
  isInvalidKeyError,
  type GifData,
  type GifProviderConfig,
  isGifResponse,
} from '@/utils/services/gif'
import { createRequestTrack, type RequestScheduler } from '@/utils/services/request-track'
import { runTrackedRequest, type ServiceMachine } from '@/utils/services/service-machine'
import { createSnapshotStore } from '@/utils/services/snapshot-store'

// Gif browser — the headless module behind the GIF selector: fetch/pagination
// behind an injected port, column balancing, and the keyboard-navigation
// machine as pure transitions over plain data. One state owner, one publish:
// the browser keeps the gif list, the balanced columns, the highlight, and the
// loading/error flags; React subscribes to the snapshot and dispatches
// intents. The churn (debounced search, overlapping requests, stale
// responses) composes the service-machine primitives
// (src/utils/services/service-machine.ts — the dispatch+effect protocol and
// the tracked-request skeleton over the request track's scheduler port and
// latest-wins guard) with the fetchPage promise factory port, so the race
// matrix and the navigation table are synchronous unit tests instead of
// renderHook + wall-clock sleeps. The
// elementFromPoint probing used by horizontal moves is inherently DOM: it
// sits behind the GifGeometry port (the adapter supplies the real probing
// implementation) so the pure transitions stay table-testable. The React
// adapter is GifSelector: snapshot in, JSX out, DOM events translated to
// intents, and the returned effects (prevent-default, focus-search, insert)
// executed against the DOM.

const API_VERSION = 'v2'
export const GIF_SEARCH_DEBOUNCE_MS = 600
const DEFAULT_COLUMN_COUNT = 4

// Horizontal probing policy: we might hit spacing between gifs, so the probe
// starts one third down the highlighted tile and keeps moving up 5px at a
// time, giving up after ten retries to avoid an infinite loop.
const HORIZONTAL_PROBE_STEP_PX = 5
const HORIZONTAL_PROBE_RETRIES = 10

/** Fetch port for a single GIF provider page — tests inject a scripted one. */
export type GifFetchOutcome = { ok: true; results: GifData[]; next: string | null } | { ok: false; message: string }

export type GifFetchPage = (url: string) => Promise<GifFetchOutcome>

/** Scheduler port for the debounced search track — an alias of the request track's `RequestScheduler`. */
export type GifScheduler = RequestScheduler

export interface GifTileRect {
  left: number
  right: number
  top: number
  width: number
  height: number
}

/**
 * Geometry port for horizontal moves: the only DOM the navigation machine
 * needs. `tileRect` returns the rendered rect of the tile for a gif index
 * (null when not rendered); `gifIndexAtPoint` returns the gif index of the
 * selector-contained tile at a viewport point (null when nothing was hit).
 */
export interface GifGeometry {
  tileRect: (index: number) => GifTileRect | null
  gifIndexAtPoint: (x: number, y: number) => number | null
}

export interface GifBrowserSnapshot {
  gifs: GifData[]
  columns: GifData[][]
  highlightedId: string | null
  isLoading: boolean
  isLazyLoading: boolean
  error: string | null
}

export type GifKeyTarget = 'input' | 'button' | 'other'

export interface GifKeyEventData {
  key: string
  shiftKey: boolean
  target: GifKeyTarget
}

export type GifBrowserIntent =
  | { type: 'search'; term: string }
  | { type: 'load-more' }
  | { type: 'set-column-count'; count: number }
  | { type: 'highlight'; id: string }
  | { type: 'select'; id: string }
  | { type: 'key'; key: string; shiftKey: boolean; target: GifKeyTarget }

/**
 * One-shot outcomes the adapter executes against the DOM: swallow the key
 * event, move focus back to the search input, or insert the selected gif.
 */
export type GifBrowserEffect =
  | { type: 'prevent-default' }
  | { type: 'focus-search' }
  | { type: 'insert'; image: { src: string; width: number; height: number } }

/** The plain-data view the navigation transitions reduce over. */
export interface GifNavState {
  gifs: GifData[]
  columns: GifData[][]
  highlightedId: string | null
}

export interface GifKeyTransition {
  state: GifNavState
  effects: GifBrowserEffect[]
}

const nullGeometry: GifGeometry = {
  tileRect: () => null,
  gifIndexAtPoint: () => null,
}

function hasUsableMedia(gif: GifData | undefined): boolean {
  if (!gif) {
    return false
  }
  const media = gif.media_formats?.gif || gif.media_formats?.tinygif
  return !!media?.url && !!media.dims
}

function findNextValidGif(gifs: GifData[], startIndex: number): GifData | undefined {
  for (let i = startIndex; i < gifs.length; i += 1) {
    if (hasUsableMedia(gifs[i])) {
      return gifs[i]
    }
  }
  return undefined
}

function findPrevValidGif(gifs: GifData[], startIndex: number): GifData | undefined {
  for (let i = startIndex; i >= 0; i -= 1) {
    if (hasUsableMedia(gifs[i])) {
      return gifs[i]
    }
  }
  return undefined
}

/** Insert uses the full gif format only — never the tinygif fallback. */
function insertImageFor(gif: GifData): { src: string; width: number; height: number } | null {
  const format = gif.media_formats.gif
  if (!format?.url || !format.dims) {
    return null
  }
  return { src: format.url, width: format.dims[0], height: format.dims[1] }
}

function probeHorizontalGif(
  gifs: GifData[],
  highlighted: GifData,
  direction: 'left' | 'right',
  geometry: GifGeometry,
): GifData | undefined {
  if (highlighted.index === undefined) {
    return undefined
  }
  const rect = geometry.tileRect(highlighted.index)
  if (!rect) {
    return undefined
  }

  const x = direction === 'left' ? rect.left - rect.width / 2 : rect.right + rect.width / 2
  let y = rect.top + rect.height / 3

  for (let jumps = 0; jumps <= HORIZONTAL_PROBE_RETRIES; jumps += 1) {
    const index = geometry.gifIndexAtPoint(x, y)
    if (index !== null) {
      const nextGif = gifs[index]
      return nextGif && hasUsableMedia(nextGif) ? nextGif : undefined
    }
    y -= HORIZONTAL_PROBE_STEP_PX
  }
  return undefined
}

const PREVENT_DEFAULT: GifBrowserEffect = { type: 'prevent-default' }
const FOCUS_SEARCH: GifBrowserEffect = { type: 'focus-search' }

/**
 * The keyboard-navigation machine as a pure transition: nav state plus a key
 * event (as data) in, next nav state plus effects out. Geometry is consulted
 * only for horizontal moves. The dispatch table mirrors the selector's
 * historical behaviour exactly, including its quirks: focus-search never
 * clears the highlight, moving past the first/last valid gif does not wrap,
 * and Enter on a button is left to native activation.
 */
export function reduceGifKey(state: GifNavState, event: GifKeyEventData, geometry: GifGeometry): GifKeyTransition {
  const { gifs, columns } = state
  const highlighted = state.highlightedId ? gifs.find((gif) => gif.id === state.highlightedId) : undefined

  const stay = (effects: GifBrowserEffect[] = []): GifKeyTransition => ({ state, effects })
  const highlight = (gif: GifData | undefined, effects: GifBrowserEffect[]): GifKeyTransition => ({
    state: { ...state, highlightedId: gif?.id ?? null },
    effects,
  })

  // Tab / ArrowDown / Enter on the search input all land on the first valid
  // gif — or clear the highlight when the list has none.
  const highlightFirst = (): GifKeyTransition => highlight(findNextValidGif(gifs, 0), [PREVENT_DEFAULT])

  const highlightNext = (): GifKeyTransition => {
    if (highlighted?.index === undefined) {
      return stay([PREVENT_DEFAULT])
    }
    const next = findNextValidGif(gifs, highlighted.index + 1)
    return next ? highlight(next, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT])
  }

  const highlightPrev = (): GifKeyTransition => {
    if (!highlighted || highlighted.index === undefined || highlighted.index === 0) {
      return stay([PREVENT_DEFAULT, FOCUS_SEARCH])
    }
    const prev = findPrevValidGif(gifs, highlighted.index - 1)
    return prev ? highlight(prev, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT, FOCUS_SEARCH])
  }

  const walkColumn = (step: 1 | -1): GifData | undefined => {
    if (!highlighted || highlighted.columnIndex === undefined || highlighted.columnRowIndex === undefined) {
      return undefined
    }
    const column = columns[highlighted.columnIndex]
    if (!column) {
      return undefined
    }
    for (let row = highlighted.columnRowIndex + step; row >= 0 && row < column.length; row += step) {
      const nextGif = column[row]
      if (nextGif && hasUsableMedia(nextGif)) {
        return nextGif
      }
    }
    return undefined
  }

  const moveDown = (): GifKeyTransition => {
    const next = walkColumn(1)
    return next ? highlight(next, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT])
  }

  const moveUp = (): GifKeyTransition => {
    if (!highlighted || highlighted.columnIndex === undefined || highlighted.columnRowIndex === undefined) {
      return stay([PREVENT_DEFAULT])
    }
    if (!columns[highlighted.columnIndex]) {
      return stay([PREVENT_DEFAULT])
    }
    const next = walkColumn(-1)
    return next ? highlight(next, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT, FOCUS_SEARCH])
  }

  const moveRight = (): GifKeyTransition => {
    if (!highlighted || highlighted.columnIndex === undefined) {
      return stay([PREVENT_DEFAULT])
    }
    if (highlighted.columnIndex >= columns.length - 1) {
      // we don't wrap and we're on the last column, do nothing
      return stay([PREVENT_DEFAULT])
    }
    const next = probeHorizontalGif(gifs, highlighted, 'right', geometry)
    return next ? highlight(next, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT])
  }

  const moveLeft = (): GifKeyTransition => {
    if (!highlighted || highlighted.index === undefined) {
      return stay([PREVENT_DEFAULT])
    }
    if (highlighted.index === 0) {
      // on the first Gif, focus the search bar
      return stay([PREVENT_DEFAULT, FOCUS_SEARCH])
    }
    if (highlighted.columnIndex === 0) {
      // we don't wrap and we're on the first column, do nothing
      return stay([PREVENT_DEFAULT])
    }
    const next = probeHorizontalGif(gifs, highlighted, 'left', geometry)
    return next ? highlight(next, [PREVENT_DEFAULT]) : stay([PREVENT_DEFAULT])
  }

  switch (event.key) {
    case 'Tab':
      if (event.shiftKey) {
        return highlighted ? highlightPrev() : stay()
      }
      if (event.target === 'input') {
        return highlightFirst()
      }
      return highlighted ? highlightNext() : stay()
    case 'ArrowLeft':
      // On the search input, left/right move the text caret — the highlight
      // (possibly hover-set) must not hijack them.
      if (event.target === 'input') {
        return stay()
      }
      return highlighted ? moveLeft() : stay()
    case 'ArrowRight':
      if (event.target === 'input') {
        return stay()
      }
      return highlighted ? moveRight() : stay()
    case 'ArrowUp':
      return highlighted ? moveUp() : stay()
    case 'ArrowDown':
      if (event.target === 'input') {
        return highlightFirst()
      }
      return highlighted ? moveDown() : stay()
    case 'Enter':
      if (event.target === 'button') {
        // let the native button activation (Enter/Space -> click) insert the GIF
        return stay()
      }
      if (event.target === 'input') {
        return highlightFirst()
      }
      if (highlighted) {
        const image = insertImageFor(highlighted)
        return image ? stay([PREVENT_DEFAULT, { type: 'insert', image }]) : stay([PREVENT_DEFAULT])
      }
      return stay()
    default:
      return stay()
  }
}

const defaultFetchPage: GifFetchPage = async (url) => {
  const response = await fetch(url)
  if (response.status >= 200 && response.status < 300) {
    const json: unknown = await response.json()
    if (!isGifResponse(json)) {
      return { ok: false, message: 'Unexpected response from the gif provider' }
    }
    return { ok: true, results: json.results, next: json.next ?? null }
  }
  const contentType = response.headers.get('content-type') || ''
  if (contentType.startsWith('application/json')) {
    const json: unknown = await response.json()
    return { ok: false, message: extractErrorMessage(json) }
  }
  return { ok: false, message: await response.text() }
}

interface CreateGifBrowserOptions {
  config: GifProviderConfig
  fetchPage?: GifFetchPage
  scheduler?: GifScheduler
  debounceMs?: number
}

export function createGifBrowser({
  config,
  fetchPage = defaultFetchPage,
  scheduler,
  debounceMs = GIF_SEARCH_DEBOUNCE_MS,
}: CreateGifBrowserOptions): ServiceMachine<GifBrowserSnapshot, GifBrowserIntent, GifBrowserEffect, GifGeometry> {
  let gifs: GifData[] = []
  let columns: GifData[][] = []
  let columnHeights: number[] = []
  let nextPos: string | null = null
  let loadedType: 'search' | 'featured' = 'featured'
  let searchTerm = ''
  let columnCount = DEFAULT_COLUMN_COUNT
  let highlightedId: string | null = null
  let isLoading = false
  let isLazyLoading = false
  let error: string | null = null

  // the snapshot store and the latest-wins request guard: a newer search
  // supersedes every in-flight request from an older generation, so a slow
  // response can never overwrite newer results (or resurrect cleared ones)
  const store = createSnapshotStore<GifBrowserSnapshot>({
    gifs,
    columns,
    highlightedId,
    isLoading,
    isLazyLoading,
    error,
  })
  const track = createRequestTrack({ scheduler })

  const emitFlags = (): void => {
    store.emit({ gifs, columns, highlightedId, isLoading, isLazyLoading, error })
  }

  const addGifToColumns = (gif: GifData): void => {
    const min = Math.min(...columnHeights)
    const colIdx = columnHeights.indexOf(min)

    columnHeights[colIdx] += 300 * (gif.ratio ?? 1)
    columns[colIdx].push(gif)

    gif.columnIndex = colIdx
    gif.columnRowIndex = columns[colIdx].length - 1
  }

  const rebuildColumns = (): void => {
    const newColumns: GifData[][] = []
    const newColumnHeights: number[] = []

    for (let i = 0; i < columnCount; i += 1) {
      newColumns[i] = []
      newColumnHeights[i] = 0
    }

    columns = newColumns
    columnHeights = newColumnHeights

    for (const gif of gifs) {
      addGifToColumns(gif)
    }
  }

  const addGif = (gif: GifData): void => {
    const tinygif = gif.media_formats?.tinygif
    if (tinygif) {
      const [width, height] = tinygif.dims
      gif.ratio = width > 0 ? height / width : 1
    } else {
      gif.ratio = 1
    }

    // the index is the global list position across pages, so keyboard
    // navigation and data-gif-index stay coherent after pagination appends
    gif.index = gifs.length
    gifs.push(gif)
    addGifToColumns(gif)
  }

  const buildUrl = (path: string, params: Record<string, string>): string => {
    const versionedPath = `${API_VERSION}/${path}`.replace(/\/+/, '/')
    const url = new URL(versionedPath, config.apiUrl)

    const search = new URLSearchParams(params)
    search.set('key', config.apiKey)
    search.set('client_key', 'inkling-editor')
    search.set('contentfilter', config.contentFilter || 'off')

    url.search = search.toString()
    return url.toString()
  }

  const runRequest = async (seq: number, path: string, params: Record<string, string>): Promise<void> => {
    error = null
    isLoading = true
    emitFlags()

    const outcome = await runTrackedRequest(track, seq, () => fetchPage(buildUrl(path, params)))

    // a newer search superseded this request while we were awaiting — the
    // newer request owns the flags, and the stale outcome must not apply
    if (!outcome) {
      return
    }

    if (outcome.ok) {
      const fetchOutcome = outcome.value
      if (fetchOutcome.ok) {
        // a malformed item must not wedge the loading flags or escape as an
        // unhandled rejection — surface the failure as the common error state
        try {
          nextPos = fetchOutcome.next
          for (const gif of fetchOutcome.results) {
            addGif(gif)
          }
          // keep the highlight by stable id across list swaps (the selector's
          // historical sync effect), clearing it when the gif is gone
          if (highlightedId && !gifs.some((gif) => gif.id === highlightedId)) {
            highlightedId = null
          }
        } catch {
          error = ERROR_TYPE.COMMON
        }
      } else {
        error = isInvalidKeyError(fetchOutcome.message) ? ERROR_TYPE.INVALID_API_KEY : ERROR_TYPE.COMMON
      }
    } else {
      const message = outcome.error instanceof Error ? outcome.error.message : 'Unknown error'
      error = isInvalidKeyError(message) ? ERROR_TYPE.INVALID_API_KEY : ERROR_TYPE.COMMON
    }

    isLoading = false
    isLazyLoading = false
    emitFlags()
  }

  const startSearchFetch = (term: string): void => {
    const generation = track.next()
    searchTerm = term
    gifs = []
    nextPos = null
    rebuildColumns()

    if (term) {
      loadedType = 'search'
      void runRequest(generation, 'search', { q: term, media_filter: 'tinygif,gif' })
    } else {
      loadedType = 'featured'
      void runRequest(generation, 'featured', { q: 'excited', media_filter: 'tinygif,gif' })
    }
  }

  const setSearch = (term: string): void => {
    track.schedule(() => {
      startSearchFetch(term)
    }, debounceMs)
  }

  const loadMore = (): void => {
    if (isLoading) {
      return
    }

    if (!gifs.length) {
      loadedType = 'featured'
      void runRequest(track.next(), 'featured', { q: 'excited', media_filter: 'tinygif,gif' })
      return
    }

    if (nextPos === null) {
      return
    }

    const params: Record<string, string> = {
      pos: nextPos,
      media_filter: 'tinygif,gif',
    }

    if (loadedType === 'search') {
      params.q = searchTerm
    }

    isLazyLoading = true

    // pagination deliberately joins the current generation — a load-more is
    // not a new search and must not supersede itself
    void runRequest(track.current(), loadedType, params)
  }

  const setColumnCount = (count: number): void => {
    // zero or negative counts leave no column for addGifToColumns to push
    // into (Math.min over an empty height list indexes column -1)
    const nextCount = Math.max(1, count)
    if (nextCount === columnCount) {
      return
    }
    columnCount = nextCount
    rebuildColumns()
    store.emit({ columns })
  }

  const dispatch = (intent: GifBrowserIntent, geometry?: GifGeometry): GifBrowserEffect[] => {
    switch (intent.type) {
      case 'search':
        setSearch(intent.term)
        return []
      case 'load-more':
        loadMore()
        return []
      case 'set-column-count':
        setColumnCount(intent.count)
        return []
      case 'highlight': {
        if (intent.id === highlightedId || !gifs.some((gif) => gif.id === intent.id)) {
          return []
        }
        highlightedId = intent.id
        store.emit({ highlightedId })
        return []
      }
      case 'select': {
        const gif = gifs.find((entry) => entry.id === intent.id)
        const image = gif ? insertImageFor(gif) : null
        return image ? [{ type: 'insert', image }] : []
      }
      case 'key': {
        const transition = reduceGifKey(
          { gifs, columns, highlightedId },
          { key: intent.key, shiftKey: intent.shiftKey, target: intent.target },
          geometry ?? nullGeometry,
        )
        if (transition.state.highlightedId !== highlightedId) {
          highlightedId = transition.state.highlightedId
          store.emit({ highlightedId })
        }
        return transition.effects
      }
    }
  }

  return {
    getSnapshot: store.getSnapshot,
    subscribe: store.subscribe,

    dispatch,

    /** Cancel the pending search, invalidate every in-flight request, and drop the store's listeners. */
    dispose: () => {
      track.dispose()
      store.dispose()
    },
  }
}

export type GifBrowser = ReturnType<typeof createGifBrowser>
