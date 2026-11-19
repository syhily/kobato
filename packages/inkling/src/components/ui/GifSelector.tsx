import type {
  GifBrowser,
  GifBrowserEffect,
  GifGeometry,
  GifKeyTarget,
} from '@kobato/inkling-internal/services/gif-browser'

import SearchIcon from '@kobato/inkling-internal/assets/icons/inkling-search.svg?react'
import { Error } from '@kobato/inkling-internal/components/ui/file-selectors/Gif/Error'
import { Gif } from '@kobato/inkling-internal/components/ui/file-selectors/Gif/Gif'
import { Loader } from '@kobato/inkling-internal/components/ui/file-selectors/Gif/Loader'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import React, { useCallback, useEffect, useRef, useState } from 'react'

const TWO_COLUMN_WIDTH = 540
const THREE_COLUMN_WIDTH = 940

function isResizeObserverSize(value: unknown): value is ResizeObserverSize {
  return typeof value === 'object' && value !== null && 'inlineSize' in value && typeof value.inlineSize === 'number'
}

export interface GifSelectorProps {
  browser: GifBrowser
  onGifInsert: (image: { src: string; width: number; height: number }) => void
  onClickOutside: () => void
  provider?: string
}

const GifSelector = ({ browser, onGifInsert, onClickOutside, provider }: GifSelectorProps) => {
  const labels = useInklingLabels()
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [focusRequestId, setFocusRequestId] = useState<string | null>(null)
  const clearFocusRequest = useCallback(() => setFocusRequestId(null), [])
  const subscribeToBrowser = useCallback((listener: () => void) => browser.subscribe(listener), [browser])
  const getBrowserSnapshot = useCallback(() => browser.getSnapshot(), [browser])
  const snapshot = React.useSyncExternalStore(subscribeToBrowser, getBrowserSnapshot)
  const { columns, isLoading, isLazyLoading, error, highlightedId } = snapshot

  useEffect(() => {
    browser.dispatch({ type: 'search', term: '' })
  }, [browser])

  useEffect(() => {
    if (!selectorRef.current) {
      return
    }

    const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      const [containerEntry] = entries
      if (!containerEntry) {
        return
      }
      const contentBoxSize: unknown = containerEntry.contentBoxSize
      const size: unknown = Array.isArray(contentBoxSize) ? contentBoxSize[0] : contentBoxSize

      const width = isResizeObserverSize(size) ? size.inlineSize : 0

      let columnsCount = 4

      if (width <= TWO_COLUMN_WIDTH) {
        columnsCount = 2
      } else if (width <= THREE_COLUMN_WIDTH) {
        columnsCount = 3
      }

      browser.dispatch({ type: 'set-column-count', count: columnsCount })
    })
    resizeObserver.observe(selectorRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [browser])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target
      if (selectorRef.current && target instanceof Node && !selectorRef.current.contains(target)) {
        onClickOutside()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClickOutside])

  const geometry: GifGeometry = {
    tileRect(index) {
      const elem = selectorRef.current?.querySelector(`[data-gif-index="${index}"]`)
      if (!elem) {
        return null
      }
      const rect = elem.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height }
    },
    gifIndexAtPoint(x, y) {
      const selector = selectorRef.current
      if (!selector) {
        return null
      }
      const match = selector.ownerDocument.elementFromPoint(x, y)?.closest('[data-gif-index]')
      if (match instanceof HTMLElement && selector.contains(match) && match.dataset.gifIndex !== undefined) {
        return Number(match.dataset.gifIndex)
      }
      return null
    },
  }

  function runEffects(effects: GifBrowserEffect[], event?: React.KeyboardEvent<HTMLDivElement>) {
    for (const effect of effects) {
      if (effect.type === 'prevent-default') {
        event?.preventDefault()
      } else if (effect.type === 'focus-search') {
        searchRef.current?.focus()
      } else {
        onGifInsert(effect.image)
      }
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented) {
      return
    }
    if (event.nativeEvent.isComposing) {
      return
    }
    if (!(event.target instanceof Node) || !selectorRef.current?.contains(event.target)) {
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return
    }

    const tagName = event.target instanceof HTMLElement ? event.target.tagName : ''
    const target: GifKeyTarget = tagName === 'INPUT' ? 'input' : tagName === 'BUTTON' ? 'button' : 'other'
    const effects = browser.dispatch({ type: 'key', key: event.key, shiftKey: event.shiftKey, target }, geometry)

    const nextHighlight = browser.getSnapshot().highlightedId
    const navigated = effects.length > 0 && !effects.some((effect) => effect.type === 'focus-search')
    if (nextHighlight && navigated) {
      setFocusRequestId(nextHighlight)
    }
    runEffects(effects, event)
  }
  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    browser.dispatch({ type: 'search', term: e.target.value })
  }
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1000) {
      browser.dispatch({ type: 'load-more' })
    }
  }

  const isSearchInProgress = isLoading && !isLazyLoading

  return (
    <div
      ref={selectorRef}
      className="border-grey-200 bg-grey-50 dark:bg-grey-900 flex h-[54rem] flex-col rounded border dark:border-none"
      data-testid="gif-selector"

      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <header className="p-6">
        <div className="relative w-full">
          <SearchIcon className="text-grey-500 dark:text-grey-800 absolute top-1/2 left-4 size-4 -translate-y-2" />
          <input
            ref={searchRef}
            className="border-grey-300 focus:border-green focus:shadow-insetgreen dark:border-grey-800 dark:bg-grey-950 dark:placeholder:text-grey-800 dark:focus:border-green h-10 w-full rounded-full border pr-8 pl-10 font-sans text-md font-normal text-black dark:text-white"
            placeholder={
              provider === 'klipy' ? labels['gif.searchPlaceholder.klipy'] : labels['gif.searchPlaceholder.tenor']
            }
            autoFocus
            onChange={handleSearch}
          />
        </div>
      </header>

      <div className="relative h-full overflow-hidden">
        <div className="h-full overflow-auto px-6" onScroll={handleScroll}>
          {!error && !isSearchInProgress && (
            <div className="flex gap-4">
              {columns.map((column, i) => (
                // oxlint-disable-next-line react/no-array-index-key
                <section key={i} className="flex grow basis-0 flex-col justify-start gap-4">
                  {column.map((gif) => (
                    <Gif
                      key={gif.id}
                      data={gif}
                      focusRequestId={focusRequestId}
                      isHighlighted={highlightedId === gif.id}
                      onClick={() => runEffects(browser.dispatch({ type: 'select', id: gif.id }))}
                      onFocus={() => browser.dispatch({ type: 'highlight', id: gif.id })}
                      onFocusRequestHandled={clearFocusRequest}
                      onMouseEnter={() => browser.dispatch({ type: 'highlight', id: gif.id })}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}

          {isLoading && !error && <Loader isLazyLoading={isLazyLoading} />}

          {!!error && (
            <div data-testid="gif-selector-error">
              <Error error={error} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default GifSelector
