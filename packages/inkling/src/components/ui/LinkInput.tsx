import CloseIcon from '@kobato/inkling-internal/assets/icons/inkling-close.svg?react'
import { Input } from '@kobato/inkling-internal/components/ui/Input'
import {
  LinkSuggestionList,
  useLinkDropdownEscape,
  useLinkDropdownOpenedTracking,
} from '@kobato/inkling-internal/components/ui/LinkSuggestionList'
import { useInklingLinkingSettings } from '@kobato/inkling-internal/context/InklingHostIntegrationContext'
import { useClickOutside } from '@kobato/inkling-internal/hooks/useClickOutside'
import { useInklingLabels } from '@kobato/inkling-internal/hooks/useInklingLabels'
import { useSearchLinks, type ListOptionItem } from '@kobato/inkling-internal/hooks/useSearchLinks'
import React, { useEffect, useRef } from 'react'

interface LinkInputProps {
  href?: string
  update: (href: string, type?: string) => void
  cancel: () => void
}

export function LinkInput({ href, update, cancel }: LinkInputProps) {
  const { searchLinks } = useInklingLinkingSettings()
  const labels = useInklingLabels()
  const [_href, setHref] = React.useState<string | undefined>(href)
  const searchEnabled = typeof searchLinks === 'function'
  const { isSearching, listOptions } = useSearchLinks(_href || '', searchEnabled ? searchLinks : undefined)

  const inputRef = useRef<HTMLInputElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const testId = 'link-input'

  useLinkDropdownOpenedTracking('text', searchEnabled)

  const [prevHref, setPrevHref] = React.useState(href)
  if (prevHref !== href) {
    setPrevHref(href)
    setHref(href)
  }

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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

      event.preventDefault()
      event.stopPropagation()
      update(target.value || '')
    },
    [update],
  )

  const inputElement = searchEnabled ? (
    <Input
      autoFocus={true}
      className="bg-grey-100 placeholder:text-grey-500 focus:border-green dark:border-grey-800/80 dark:bg-grey-900 dark:selection:bg-grey-600/40 dark:selection:text-grey-100 dark:focus:border-green dark:focus:bg-grey-900 my-1 h-auto w-full rounded-md border border-transparent px-4 py-2 text-left text-sm leading-snug font-medium text-black placeholder:text-sm placeholder:leading-snug placeholder:font-medium focus:bg-white focus:shadow-[0_0_0_0.2rem_rgba(48,207,67,.25)] dark:text-white"
      dataTestId={testId}
      name="link-input"
      placeholder={labels['link.search.placeholder']}
      value={_href}
      data-inkling-link-input
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        setHref(e.target.value)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          update(e.currentTarget.value || '')
        }
      }}
    />
  ) : (
    <input
      ref={inputRef}
      className="text-grey-900 selection:bg-grey/40 dark:bg-grey-950 dark:text-grey-300 dark:selection:bg-grey-800/40 dark:selection:text-grey-100 mb-[0.1rem] h-8 w-full pl-3 leading-loose"
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
          e.preventDefault()
          update(e.currentTarget.value || '')
        }
      }}
    />
  )

  return (
    <div
      ref={containerRef}
      className={
        searchEnabled
          ? 'dark:bg-grey-950 relative m-0 flex w-full flex-col rounded-lg bg-white p-1 px-2 font-sans text-sm font-medium shadow-md'
          : 'dark:bg-grey-950 relative m-0 flex items-center justify-evenly gap-1 rounded-lg bg-white p-1 font-sans text-md font-normal text-black shadow-md'
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
          <CloseIcon className="text-grey size-4 stroke-2" />
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
