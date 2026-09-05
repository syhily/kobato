import React, { useEffect, useRef } from 'react'

import type { LibraryImageItem } from '@/context/InklingHostIntegrationContext'
import type { LibraryBrowser } from '@/utils/services/library-browser'

import SearchIcon from '@/assets/icons/inkling-search.svg?react'
import UploadIcon from '@/assets/icons/inkling-upload-fill.svg?react'
import { Loader } from '@/components/ui/file-selectors/Gif/Loader'
import { useInklingLabels } from '@/hooks/useInklingLabels'

export interface LibrarySelectorProps {
  browser: LibraryBrowser<LibraryImageItem>
  onPick: (item: LibraryImageItem) => void
  onClickOutside: () => void
  /** present only when the host configured an upload callback */
  onUpload?: () => void
}

// Render adapter over the headless library browser: snapshot in, JSX out.
// Deliberately plainer than GifSelector — square tiles are plain buttons
// (Tab order = DOM order), with no column balancing, keyboard-navigation
// machine, or infinite scroll. Click-outside listening is built in (the
// GifSelector precedent); Escape handling lives in LibraryPlugin.
const LibrarySelector = ({ browser, onPick, onClickOutside, onUpload }: LibrarySelectorProps) => {
  const labels = useInklingLabels()
  const selectorRef = useRef<HTMLDivElement | null>(null)
  const snapshot = React.useSyncExternalStore(browser.subscribe, browser.getSnapshot)
  const { items, isLoading, error } = snapshot

  // the default (unfiltered) listing fires immediately on open
  useEffect(() => {
    browser.dispatch({ type: 'search', term: '' })
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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    browser.dispatch({ type: 'search', term: e.target.value })
  }

  return (
    <div
      ref={selectorRef}
      className="flex h-[540px] flex-col rounded border border-grey-200 bg-grey-50 dark:border-none dark:bg-grey-900"
      data-testid="library-selector"
      // prevent click handle in the editor while selector is active
      onClick={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-3 p-6">
        <div className="relative w-full">
          <SearchIcon className="absolute top-1/2 left-4 size-4 -translate-y-2 text-grey-500 dark:text-grey-800" />
          <input
            className="h-10 w-full rounded-full border border-grey-300 pr-8 pl-10 font-sans text-md font-normal text-black focus:border-green focus:shadow-insetgreen dark:border-grey-800 dark:bg-grey-950 dark:text-white dark:placeholder:text-grey-800 dark:focus:border-green"
            placeholder={labels['library.search.placeholder']}
            autoFocus
            onChange={handleSearch}
          />
        </div>
        {onUpload && (
          <button
            type="button"
            className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-grey-300 px-4 font-sans text-md font-normal text-black hover:border-green dark:border-grey-800 dark:text-white dark:hover:border-green"
            data-testid="library-upload"
            onClick={onUpload}
          >
            <UploadIcon className="size-4" />
            {labels['library.upload']}
          </button>
        )}
      </header>

      <div className="relative h-full overflow-hidden">
        <div className="h-full overflow-auto px-6 pb-6">
          {!error && !isLoading && items.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {items.map((item) => (
                <button
                  key={item.src}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded border border-grey-200 bg-grey-100 hover:border-green dark:border-grey-800 dark:bg-grey-950 dark:hover:border-green"
                  data-testid="library-item"
                  onClick={() => onPick(item)}
                >
                  <img src={item.src} alt={item.alt ?? ''} className="size-full object-cover" />
                  {typeof item.width === 'number' && typeof item.height === 'number' && (
                    <span className="absolute right-1 bottom-1 rounded bg-black/60 px-1.5 py-0.5 font-sans text-xs text-white">
                      {item.width}×{item.height}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!error && !isLoading && items.length === 0 && (
            <p
              className="p-6 text-center font-sans text-md text-grey-600 dark:text-grey-700"
              data-testid="library-selector-empty"
            >
              {labels['library.empty']}
            </p>
          )}

          {!!isLoading && !error && <Loader />}

          {!!error && (
            <div
              className="p-6 text-center font-sans text-md text-grey-600 dark:text-grey-700"
              data-testid="library-selector-error"
            >
              <p>{labels['library.error']}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default LibrarySelector
