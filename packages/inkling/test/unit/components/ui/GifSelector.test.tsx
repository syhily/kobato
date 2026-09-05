import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GifData } from '@/utils/services/gif'

import { tick } from '#/utils/test-editor'
import GifSelector from '@/components/ui/GifSelector'
import {
  createGifBrowser,
  type GifBrowser,
  type GifFetchOutcome,
  type GifScheduler,
} from '@/utils/services/gif-browser'

// Adapter tests: the navigation machine itself is covered by the pure
// transition table in gif-browser.test.ts. This file pins the DOM wiring —
// snapshot rendering, DOM events translated to intents, and the returned
// effects (prevent-default, focus, insert) executed against the DOM.

const CONFIG = {
  provider: 'tenor',
  apiUrl: 'https://tenor.googleapis.com',
  apiKey: 'test-key',
  contentFilter: 'off',
}

function createGif(index: number, overrides: Partial<GifData> = {}): GifData {
  return {
    id: `gif-${index}`,
    content_description: `Gif ${index}`,
    media_formats: {
      tinygif: { url: `https://example.com/gif-${index}-tiny.gif`, dims: [100, 100] },
      gif: { url: `https://example.com/gif-${index}.gif`, dims: [100, 100] },
    },
    ...overrides,
  }
}

interface ManualScheduler extends GifScheduler {
  flush: () => void
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
  }
}

interface RenderSelectorOptions {
  gifs?: GifData[]
  next?: string | null
  provider?: string
  fetchImpl?: (url: string) => Promise<GifFetchOutcome>
  onGifInsert?: (image: { src: string; width: number; height: number }) => void
  onClickOutside?: () => void
}

async function renderSelector({
  gifs = [createGif(0), createGif(1), createGif(2)],
  next = null,
  provider = 'tenor',
  fetchImpl,
  onGifInsert = vi.fn<(image: { src: string; width: number; height: number }) => void>(),
  onClickOutside = vi.fn<() => void>(),
}: RenderSelectorOptions = {}) {
  const scheduler = createManualScheduler()
  const fetchPage = vi.fn<(url: string) => Promise<GifFetchOutcome>>(
    fetchImpl ?? (() => Promise.resolve({ ok: true, results: gifs, next })),
  )
  const browser: GifBrowser = createGifBrowser({ config: CONFIG, fetchPage, scheduler })

  const utils = render(
    <GifSelector browser={browser} provider={provider} onGifInsert={onGifInsert} onClickOutside={onClickOutside} />,
  )

  // the mount search is debounced; flush it and let the page land
  await act(async () => {
    scheduler.flush()
    await tick()
  })

  return { browser, scheduler, fetchPage, onGifInsert, onClickOutside, ...utils }
}

function setScrollProps(element: HTMLDivElement, scrollTop: number, clientHeight: number, scrollHeight: number) {
  element.scrollTop = scrollTop
  Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true })
  Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true })
}

afterEach(() => {
  // jsdom does not implement elementFromPoint; tests stub it per-case
  delete (document as Partial<Document>).elementFromPoint
})

describe('GifSelector: snapshot rendering', () => {
  it('fetches the featured page on mount', async () => {
    const { fetchPage } = await renderSelector()

    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(new URL(fetchPage.mock.calls[0][0]).pathname).toBe('/v2/featured')
  })

  it('renders search input with provider placeholder', async () => {
    await renderSelector({ provider: 'klipy' })
    expect(screen.getByPlaceholderText('Search KLIPY')).toBeInTheDocument()
  })

  it('renders the loading state while the first page is in flight', async () => {
    await renderSelector({ fetchImpl: () => new Promise<GifFetchOutcome>(() => {}) })

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByTestId('gif-item')).not.toBeInTheDocument()
  })

  it('keeps the list visible and renders the loader while lazy loading', async () => {
    const { browser } = await renderSelector({
      next: 'cursor-2',
      fetchImpl: (url) =>
        url.includes('pos=')
          ? new Promise<GifFetchOutcome>(() => {})
          : Promise.resolve({ ok: true, results: [createGif(0)], next: 'cursor-2' }),
    })

    act(() => {
      browser.dispatch({ type: 'load-more' })
    })

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.getAllByTestId('gif-item')).toHaveLength(1)
  })

  it('renders the common error state', async () => {
    await renderSelector({ fetchImpl: () => Promise.resolve({ ok: false, message: 'boom' }) })

    expect(
      screen.getByText('Uh-oh! Trouble reaching the GIF service, please check your connection'),
    ).toBeInTheDocument()
  })

  it('renders the invalid api key error', async () => {
    await renderSelector({ fetchImpl: () => Promise.resolve({ ok: false, message: 'API key not valid' }) })

    expect(screen.getByText(/The GIF API key is not valid/)).toBeInTheDocument()
  })

  it('renders every result as a semantic button with accessible name', async () => {
    await renderSelector({ gifs: [createGif(0), createGif(1)] })

    expect(screen.getByRole('button', { name: 'Gif 0' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gif 1' })).toBeInTheDocument()
  })

  it('result buttons have type button', async () => {
    await renderSelector({ gifs: [createGif(0)] })

    expect(screen.getByRole('button', { name: 'Gif 0' })).toHaveAttribute('type', 'button')
  })

  it('does not render a button for a gif without usable media', async () => {
    await renderSelector({ gifs: [createGif(0), createGif(1, { media_formats: {} })] })

    expect(screen.getByRole('button', { name: 'Gif 0' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Gif 1' })).not.toBeInTheDocument()
  })

  it('dispatches the debounced search intent when the input changes', async () => {
    const { fetchPage, scheduler } = await renderSelector()

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    fireEvent.change(input, { target: { value: 'cats' } })

    // the search is debounced inside the browser
    expect(fetchPage).toHaveBeenCalledTimes(1)

    await act(async () => {
      scheduler.flush()
      await tick()
    })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage.mock.calls[1][0]).toContain('q=cats')
  })
})

describe('GifSelector: keyboard navigation through the adapter', () => {
  it('focuses and highlights the first gif on ArrowDown from search', async () => {
    await renderSelector({ gifs: [createGif(0), createGif(1)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    const handled = fireEvent.keyDown(input, { key: 'ArrowDown' })

    // a handled key is swallowed
    expect(handled).toBe(false)

    const button = screen.getByRole('button', { name: 'Gif 0' })
    expect(button).toHaveFocus()
    expect(button).toHaveClass('border-green')
  })

  it('focuses and highlights the first gif on Tab from search', async () => {
    await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{Tab}')

    expect(screen.getByRole('button', { name: 'Gif 0' })).toHaveFocus()
  })

  it('skips invalid gifs when navigating with ArrowDown', async () => {
    const { browser } = await renderSelector({
      gifs: [createGif(0), createGif(1, { media_formats: {} }), createGif(2)],
    })
    // one column so ArrowDown walks the rows
    act(() => {
      browser.dispatch({ type: 'set-column-count', count: 1 })
    })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    const button = screen.getByRole('button', { name: 'Gif 2' })
    expect(button).toHaveFocus()
    expect(button).toHaveClass('border-green')
  })

  it('moves highlight and focus down with ArrowDown', async () => {
    const { browser } = await renderSelector({ gifs: [createGif(0), createGif(1)] })
    act(() => {
      browser.dispatch({ type: 'set-column-count', count: 1 })
    })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}')

    const button = screen.getByRole('button', { name: 'Gif 1' })
    expect(button).toHaveFocus()
    expect(button).toHaveClass('border-green')
  })

  it('moves highlight and focus up with ArrowUp', async () => {
    const { browser } = await renderSelector({ gifs: [createGif(0), createGif(1)] })
    act(() => {
      browser.dispatch({ type: 'set-column-count', count: 1 })
    })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')

    const button = screen.getByRole('button', { name: 'Gif 0' })
    expect(button).toHaveFocus()
    expect(button).toHaveClass('border-green')
  })

  it('focuses search when arrow up on first gif', async () => {
    await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')

    expect(input).toHaveFocus()
  })

  it('moves highlight and focus horizontally through the geometry port', async () => {
    await renderSelector({ gifs: [createGif(0), createGif(1)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}')

    const button = screen.getByRole('button', { name: 'Gif 1' })
    document.elementFromPoint = () => button
    await userEvent.keyboard('{ArrowRight}')

    expect(button).toHaveFocus()
    expect(button).toHaveClass('border-green')
  })

  it('selects the highlighted gif with Enter on the focused button', async () => {
    const { onGifInsert } = await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{Enter}')

    expect(onGifInsert).toHaveBeenCalledTimes(1)
    expect(onGifInsert).toHaveBeenCalledWith({ src: 'https://example.com/gif-0.gif', width: 100, height: 100 })
  })

  it('selects the highlighted gif with Space on the focused button', async () => {
    const { onGifInsert } = await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown} ')

    expect(onGifInsert).toHaveBeenCalledTimes(1)
    expect(onGifInsert).toHaveBeenCalledWith({ src: 'https://example.com/gif-0.gif', width: 100, height: 100 })
  })

  it('Enter inserts the highlighted gif and prevents the default', async () => {
    const { onGifInsert } = await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const handled = fireEvent.keyDown(screen.getByTestId('gif-selector'), { key: 'Enter' })

    expect(handled).toBe(false)
    expect(onGifInsert).toHaveBeenCalledWith({ src: 'https://example.com/gif-0.gif', width: 100, height: 100 })
  })

  it('ignores modified key events', async () => {
    await renderSelector({ gifs: [createGif(0)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    const handled = fireEvent.keyDown(input, { key: 'ArrowDown', metaKey: true })

    expect(handled).toBe(true)
    expect(screen.getByRole('button', { name: 'Gif 0' })).not.toHaveClass('border-green')
  })

  it('does not select or prevent default when Enter is pressed outside the selector', async () => {
    const { onGifInsert } = await renderSelector({ gifs: [createGif(0)] })

    const outsideInput = document.createElement('input')
    document.body.appendChild(outsideInput)
    outsideInput.focus()
    const handled = fireEvent.keyDown(outsideInput, { key: 'Enter' })

    expect(handled).toBe(true)
    expect(onGifInsert).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Gif 0' })).not.toHaveClass('border-green')
    outsideInput.remove()
  })

  it('does not change highlight or prevent default when arrow keys are pressed outside the selector', async () => {
    await renderSelector({ gifs: [createGif(0)] })

    const outsideInput = document.createElement('input')
    document.body.appendChild(outsideInput)
    outsideInput.focus()

    expect(fireEvent.keyDown(outsideInput, { key: 'ArrowDown' })).toBe(true)
    expect(fireEvent.keyDown(outsideInput, { key: 'ArrowRight' })).toBe(true)
    expect(screen.getByRole('button', { name: 'Gif 0' })).not.toHaveClass('border-green')
    outsideInput.remove()
  })

  it('does nothing when arrow keys are pressed without a highlighted gif', async () => {
    await renderSelector({ gifs: [] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowLeft}{ArrowRight}{ArrowUp}')

    expect(screen.getByTestId('gif-selector')).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('handles shift+tab navigation back to the search input', async () => {
    await renderSelector({ gifs: [createGif(0), createGif(1)] })

    const input = screen.getByPlaceholderText('Search Tenor for GIFs')
    await userEvent.click(input)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Shift>}{Tab}{/Shift}')

    expect(input).toHaveFocus()
  })

  it('removes all selector keyboard handling on unmount', async () => {
    const { onGifInsert, unmount } = await renderSelector({ gifs: [createGif(0)] })

    unmount()

    expect(fireEvent.keyDown(document, { key: 'Enter' })).toBe(true)
    expect(onGifInsert).not.toHaveBeenCalled()
  })
})

describe('GifSelector: scroll pagination, click-outside, and resize', () => {
  it('loads the next page when scrolled near the bottom', async () => {
    const { fetchPage } = await renderSelector({ next: 'cursor-2' })

    const scrollContainer = document.querySelector('[data-testid="gif-selector"] .overflow-auto') as HTMLDivElement
    setScrollProps(scrollContainer, 1000, 500, 1500)
    await act(async () => {
      fireEvent.scroll(scrollContainer)
      await tick()
    })

    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(new URL(fetchPage.mock.calls[1][0]).searchParams.get('pos')).toBe('cursor-2')
  })

  it('does not load the next page when not scrolled near the bottom', async () => {
    const { fetchPage } = await renderSelector({ next: 'cursor-2' })

    const scrollContainer = document.querySelector('[data-testid="gif-selector"] .overflow-auto') as HTMLDivElement
    setScrollProps(scrollContainer, 100, 500, 2000)
    fireEvent.scroll(scrollContainer)

    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it('calls onClickOutside when clicking outside', async () => {
    const { onClickOutside } = await renderSelector()

    fireEvent.mouseDown(document.body)
    expect(onClickOutside).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(screen.getByTestId('gif-selector'))
    expect(onClickOutside).toHaveBeenCalledTimes(1)
  })

  it('rebalances columns when the container width changes', async () => {
    let callback: ResizeObserverCallback = () => {}
    const OriginalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) {
        callback = cb
      }
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    } as unknown as typeof ResizeObserver

    try {
      const { browser } = await renderSelector({ gifs: [createGif(0), createGif(1), createGif(2)] })
      expect(browser.getSnapshot().columns).toHaveLength(4)

      const entry = (inlineSize: number) =>
        ({ contentBoxSize: [{ inlineSize }], target: document.createElement('div') }) as unknown as ResizeObserverEntry

      act(() => {
        callback([entry(400)], {} as ResizeObserver)
      })
      expect(browser.getSnapshot().columns).toHaveLength(2)

      act(() => {
        callback([entry(700)], {} as ResizeObserver)
      })
      expect(browser.getSnapshot().columns).toHaveLength(3)

      act(() => {
        callback([entry(1000)], {} as ResizeObserver)
      })
      expect(browser.getSnapshot().columns).toHaveLength(4)
    } finally {
      globalThis.ResizeObserver = OriginalResizeObserver
    }
  })
})
