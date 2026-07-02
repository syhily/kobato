import React, { useEffect, useRef, useState } from 'react'

import type { GifData } from '@/ui/inkling-editor/utils/services/gif'

import SearchIcon from '@/ui/inkling-editor/assets/icons/inkling-search.svg?react'
import { Error } from '@/ui/inkling-editor/components/ui/file-selectors/Gif/Error'
import { Gif } from '@/ui/inkling-editor/components/ui/file-selectors/Gif/Gif'
import { Loader } from '@/ui/inkling-editor/components/ui/file-selectors/Gif/Loader'

// number of columns based on selector container width
const TWO_COLUMN_WIDTH = 540
const THREE_COLUMN_WIDTH = 940

export interface GifSelectorProps {
  onGifInsert: (image: { src: string; width: number; height: number }) => void
  onClickOutside: () => void
  updateSearch: (term?: string) => void
  columns: GifData[][]
  isLoading: boolean
  isLazyLoading: boolean
  error: string | null
  changeColumnCount: (count: number) => void
  loadNextPage: () => void
  gifs: GifData[]
  provider?: string
  [key: string]: unknown
}

const GifSelector = ({
  onGifInsert,
  onClickOutside,
  updateSearch,
  columns,
  isLoading,
  isLazyLoading,
  error,
  changeColumnCount,
  loadNextPage,
  gifs,
  provider,
}: GifSelectorProps) => {
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [highlightedGif, setHighlightedGif] = useState<GifData | undefined>(undefined)

  useEffect(() => {
    updateSearch()

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectorRef.current) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const [containerEntry] = entries
      const contentBoxSize = Array.isArray(containerEntry.contentBoxSize)
        ? containerEntry.contentBoxSize[0]
        : containerEntry.contentBoxSize

      const width = contentBoxSize.inlineSize

      let columnsCount = 4

      if (width <= TWO_COLUMN_WIDTH) {
        columnsCount = 2
      } else if (width <= THREE_COLUMN_WIDTH) {
        columnsCount = 3
      }

      changeColumnCount(columnsCount)
    })
    resizeObserver.observe(selectorRef.current)

    return () => {
      resizeObserver?.disconnect()
    }

    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleGifHighlightRef = useRef(handleGifHighlight)
  handleGifHighlightRef.current = handleGifHighlight

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleGifHighlightRef.current(event)
    document.addEventListener('keydown', listener)

    return () => {
      document.removeEventListener('keydown', listener)
    }
    // We only do this for init
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        onClickOutside()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClickOutside])

  function handleGifSelect(selectedGif: GifData) {
    const gif = selectedGif.media_formats.gif
    if (!gif?.url || !gif.dims) {
      return
    }
    const data = {
      src: gif.url,
      width: gif.dims[0],
      height: gif.dims[1],
    }
    onGifInsert(data)
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSearch(e.target.value)
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.target as HTMLDivElement
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 1000) {
      loadNextPage()
    }
  }

  function focusSearch() {
    searchRef.current?.focus()
  }

  function highlightFirst() {
    setHighlightedGif(gifs[0])
  }

  function highlightNext() {
    if (!highlightedGif || highlightedGif === gifs[gifs.length - 1]) {
      // reached the end, do nothing
      return
    }

    setHighlightedGif(gifs[highlightedGif.index! + 1])
  }

  function highlightPrev() {
    if (!highlightedGif || highlightedGif.index === 0) {
      // reached the beginning, focus the search bar
      focusSearch()
      return
    }

    setHighlightedGif(gifs[highlightedGif.index! - 1])
  }

  function moveHighlightDown() {
    if (!highlightedGif) {
      return
    }
    const nextGif = columns[highlightedGif.columnIndex!][highlightedGif.columnRowIndex! + 1]

    if (nextGif) {
      setHighlightedGif(nextGif)
    }
  }

  function moveHighlightUp() {
    if (!highlightedGif) {
      return
    }
    const nextGif = columns[highlightedGif.columnIndex!][highlightedGif.columnRowIndex! - 1]

    if (nextGif) {
      setHighlightedGif(nextGif)
    } else {
      // already at top, focus the search bar
      focusSearch()
    }
  }

  function moveToNextHorizontalGif(direction: 'left' | 'right') {
    if (!highlightedGif) {
      return
    }
    const highlightedElem = document.querySelector(`[data-gif-index="${highlightedGif.index}"]`)
    if (!highlightedElem) {
      return
    }
    const highlightedElemRect = highlightedElem.getBoundingClientRect()

    let x
    if (direction === 'left') {
      x = highlightedElemRect.left - highlightedElemRect.width / 2
    } else {
      x = highlightedElemRect.right + highlightedElemRect.width / 2
    }

    let y = highlightedElemRect.top + highlightedElemRect.height / 3

    let foundGifElem
    let jumps = 0

    // we might hit spacing between gifs, keep moving up 5 px until we get a match
    while (!foundGifElem) {
      if (!document.elementFromPoint) {
        break
      }
      let possibleMatch = document.elementFromPoint(x, y)?.closest('[data-gif-index]')

      if ((possibleMatch as HTMLElement | null)?.dataset.gifIndex !== undefined) {
        foundGifElem = possibleMatch
        break
      }

      jumps += 1
      y -= 5

      if (jumps > 10) {
        // give up to avoid infinite loop
        break
      }
    }

    if (foundGifElem) {
      setHighlightedGif(gifs[Number((foundGifElem as HTMLElement).dataset.gifIndex)])
    }
  }

  function moveHighlightRight() {
    if (!highlightedGif || highlightedGif.columnIndex === columns.length - 1) {
      // we don't wrap and we're on the last column, do nothing
      return
    }

    moveToNextHorizontalGif('right')
  }

  function moveHighlightLeft() {
    if (!highlightedGif || highlightedGif.index === 0) {
      // on the first Gif, focus the search bar
      return focusSearch()
    }

    if (highlightedGif.columnIndex === 0) {
      // we don't wrap and we're on the first column, do nothing
      return
    }

    moveToNextHorizontalGif('left')
  }

  function handleGifHighlight(event: KeyboardEvent) {
    switch (event.key) {
      case 'Tab':
        return handleTab(event)
      case 'ArrowLeft':
        return handleLeft(event)
      case 'ArrowRight':
        return handleRight(event)
      case 'ArrowUp':
        return handleUp(event)
      case 'ArrowDown':
        return handleDown(event)
      case 'Enter':
        return handleEnter(event)
      default:
        return null
    }
  }

  function handleTab(event: KeyboardEvent) {
    // event.stopPropagation();
    // event.preventDefault();

    if (event.shiftKey) {
      if (highlightedGif) {
        event.preventDefault()
        return highlightPrev()
      }
    } else {
      if ((event?.target as HTMLElement)?.tagName === 'INPUT') {
        event.preventDefault()
        ;(event.target as HTMLElement).blur()
        return highlightFirst()
      }

      if (highlightedGif) {
        event?.preventDefault()
        return highlightNext()
      }
    }
  }

  function handleLeft(event: KeyboardEvent) {
    if (highlightedGif) {
      event.preventDefault()
      moveHighlightLeft()
    }
  }

  function handleRight(event: KeyboardEvent) {
    if (highlightedGif) {
      event.preventDefault()
      moveHighlightRight()
    }
  }

  function handleUp(event: KeyboardEvent) {
    if (highlightedGif) {
      event.preventDefault()
      moveHighlightUp()
    }
  }

  function handleDown(event: KeyboardEvent) {
    if ((event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault()
      ;(event.target as HTMLElement).blur()
      return highlightFirst()
    }

    if (highlightedGif) {
      event.preventDefault()
      moveHighlightDown()
    }
  }

  function handleEnter(event: KeyboardEvent) {
    event.preventDefault()

    if ((event.target as HTMLElement).tagName === 'INPUT') {
      ;(event.target as HTMLElement).blur()
      return highlightFirst()
    }

    if (highlightedGif) {
      return handleGifSelect(highlightedGif)
    }
  }

  const isSearchInProgress = isLoading && !isLazyLoading

  return (
    <div
      ref={selectorRef}
      className="flex h-[540px] flex-col rounded border border-grey-200 bg-grey-50 dark:border-none dark:bg-grey-900"
      data-testid="gif-selector"
      // prevent click handle in the editor while selector is active
      onClick={(e) => e.stopPropagation()}
    >
      <header className="p-6">
        <div className="relative w-full">
          <SearchIcon className="absolute top-1/2 left-4 size-4 -translate-y-2 text-grey-500 dark:text-grey-800" />
          <input
            ref={searchRef}
            className="focus:shadow-insetgreen h-10 w-full rounded-full border border-grey-300 pr-8 pl-10 font-sans text-md font-normal text-black focus:border-green dark:border-grey-800 dark:bg-grey-950 dark:text-white dark:placeholder:text-grey-800 dark:focus:border-green"
            placeholder={provider === 'klipy' ? 'Search KLIPY' : 'Search Tenor for GIFs'}
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
                      isHighlighted={highlightedGif === gif}
                      onClick={() => handleGifSelect(gif)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}

          {!!isLoading && !error && <Loader isLazyLoading={isLazyLoading} />}

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
