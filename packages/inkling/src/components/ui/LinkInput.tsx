import React, { useEffect, useRef } from 'react'

import CloseIcon from '@/assets/icons/inkling-close.svg?react'
import { Input } from '@/components/ui/Input'
import {
  LinkSuggestionList,
  useLinkDropdownEscape,
  useLinkDropdownOpenedTracking,
} from '@/components/ui/LinkSuggestionList'
import { useInklingLinkingSettings } from '@/context/InklingHostIntegrationContext'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { useSearchLinks, type ListOptionItem } from '@/hooks/useSearchLinks'

interface LinkInputProps {
  href?: string
  update: (href: string, type?: string) => void
  cancel: () => void
}

// The one link-field: plain input by default, a search-suggestion list when
// the host provides a searchLinks capability (read from host-integration
// context — callers never fork). Shared chrome (href mirroring, dismissal,
// Enter-submits-raw) lives here once; the search capability only changes
// what renders below the input.
export function LinkInput({ href, update, cancel }: LinkInputProps) {
  const { searchLinks } = useInklingLinkingSettings()
  const labels = useInklingLabels()

  // store the href/query in state so we can update it without affecting the saved editor value
  const [_href, setHref] = React.useState<string | undefined>(href)
  const searchEnabled = typeof searchLinks === 'function'
  const { isSearching, listOptions } = useSearchLinks(_href || '', searchEnabled ? searchLinks : undefined)

  // add refs for input and container
  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const testId = 'link-input'

  useLinkDropdownOpenedTracking('text', searchEnabled)

  // adjust state during render: mirror a changed href prop into local state
  const [prevHref, setPrevHref] = React.useState(href)
  if (prevHref !== href) {
    setPrevHref(href)
    setHref(href)
  }

  // when link is open, focus the input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // close link input when clicking outside or pressing escape
  useClickOutside(true, containerRef, () => cancel())
  useLinkDropdownEscape(cancel)

  const onItemSelected = (item: ListOptionItem) => {
    update(item.value || '', item.type)
  }

  const showSuggestions = searchEnabled && (isSearching || (listOptions && !!listOptions.length))

  const handleContainerKeyDownCapture = React.useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'Enter') {
        return
      }

      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.dataset.inklingLinkInput === undefined) {
        return
      }

      // The suggestion list's global capture listener runs before this handler.
      // If the user navigated the list it will already have stopped propagation,
      // so reaching here means no suggestion was selected. Submit the typed URL
      // directly and stop the event so the input's own bubble handler doesn't
      // duplicate the update.
      event.preventDefault()
      event.stopPropagation()
      update(target.value || '')
    },
    [update],
  )

  const inputElement = searchEnabled ? (
    <Input
      autoFocus={true}
      className="my-1 h-auto w-full rounded-md border border-transparent bg-grey-100 px-4 py-2 text-left text-sm leading-snug font-medium text-black placeholder:text-sm placeholder:leading-snug placeholder:font-medium placeholder:text-grey-500 focus:border-green focus:bg-white focus:shadow-[0_0_0_2px_rgba(48,207,67,.25)] dark:border-grey-800/80 dark:bg-grey-900 dark:text-white dark:selection:bg-grey-600/40 dark:selection:text-grey-100 dark:focus:border-green dark:focus:bg-grey-900"
      dataTestId={testId}
      name="link-input"
      placeholder={labels['link.search.placeholder']}
      value={_href}
      data-inkling-link-input
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        // update local value to allow searching
        setHref(e.target.value)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          // prevent Enter from triggering in the editor and removing text
          // update the link value in the editor. Read the live input value so
          // the last keystroke is always captured even if React state updates
          // are slightly behind the native input value.
          e.preventDefault()
          update(e.currentTarget.value || '')
          return
        }
      }}
    />
  ) : (
    <input
      ref={inputRef}
      className="mb-[1px] h-8 w-full pl-3 leading-loose text-grey-900 selection:bg-grey/40 dark:bg-grey-950 dark:text-grey-300 dark:selection:bg-grey-800/40 dark:selection:text-grey-100"
      data-testid={testId}
      name="link-input"
      placeholder={labels['link.input.placeholder']}
      value={_href}
      data-inkling-link-input
      onInput={(e: React.InputEvent<HTMLInputElement>) => {
        setHref(e.currentTarget.value)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          // prevent Enter from triggering in the editor and removing text
          // update the link value in the editor. Read the live input value so
          // the last keystroke is always captured even if React state updates
          // are slightly behind the native input value.
          e.preventDefault()
          update(e.currentTarget.value || '')
          return
        }
      }}
    />
  )

  return (
    <div
      ref={containerRef}
      className={
        searchEnabled
          ? 'relative m-0 flex w-full flex-col rounded-lg bg-white p-1 px-2 font-sans text-sm font-medium shadow-md dark:bg-grey-950'
          : 'relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white p-1 font-sans text-md font-normal text-black shadow-md dark:bg-grey-950'
      }
      onKeyDownCapture={searchEnabled ? handleContainerKeyDownCapture : undefined}
    >
      {inputElement}

      {!searchEnabled && !!_href && (
        <button
          aria-label={labels['aria.close']}
          className="absolute right-3 cursor-pointer"
          type="button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation()
            setHref('')
            inputRef.current?.focus()
          }}
        >
          <CloseIcon className="size-4 stroke-2 text-grey" />
        </button>
      )}

      {showSuggestions && (
        <LinkSuggestionList
          dataTestId={testId}
          groups={listOptions}
          highlightString={_href}
          isLoading={isSearching}
          showLoadingItem={true}
          onSelect={onItemSelected}
        />
      )}
    </div>
  )
}
