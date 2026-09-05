import { LexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import React from 'react'

import CloseIcon from '@/assets/icons/inkling-close.svg?react'
import { InputList } from '@/components/ui/InputList'
import {
  createLinkSuggestionGetItem,
  useLinkDropdownEscape,
  useLinkDropdownOpenedTracking,
} from '@/components/ui/LinkSuggestionList'
import { useInklingLinkingSettings } from '@/context/InklingHostIntegrationContext'
import { useInklingLabels } from '@/hooks/useInklingLabels'
import { useSearchLinks, type ListOptionItem } from '@/hooks/useSearchLinks'

export interface UrlInputProps {
  dataTestId?: string
  handleClose?: () => void
  handlePasteAsLink?: (href: string) => void
  handleRetry?: () => void
  handleUrlChange?: (value: string) => void
  handleUrlSubmit?: (url: string, type?: string) => void
  hasError?: boolean
  isLoading?: boolean
  placeholder?: string
  value?: string
}

// submits the URL on Enter even when focus is in the main editor rather
// than the input (e.g. right after pasting a URL into the editor)
function UrlInputPlugin({ onEnter }: { onEnter?: () => void }) {
  const composerContext = React.useContext(LexicalComposerContext)
  const editor = composerContext?.[0]

  React.useEffect(() => {
    if (!editor || !onEnter) {
      return
    }

    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      () => {
        onEnter()
        return false
      },
      COMMAND_PRIORITY_LOW,
    )
  }, [editor, onEnter])

  return null
}

// The one URL field: a plain input by default, a search-suggestion list
// when the host provides a searchLinks capability (read from
// host-integration context — callers never fork). The loading, error, and
// close chrome lives here once; the capability only changes the input row.
export function UrlInput({
  dataTestId = 'url-input',
  handleClose,
  handlePasteAsLink,
  handleRetry,
  handleUrlChange,
  handleUrlSubmit,
  hasError,
  isLoading,
  placeholder,
  value = '',
}: UrlInputProps) {
  const { searchLinks } = useInklingLinkingSettings()
  const labels = useInklingLabels()
  const searchEnabled = typeof searchLinks === 'function'
  const { isSearching, listOptions } = useSearchLinks(value || '', searchEnabled ? searchLinks : undefined)

  useLinkDropdownOpenedTracking('bookmark', searchEnabled && !value)
  useLinkDropdownEscape(handleClose, { swallow: true })

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    handleUrlChange?.(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      handleUrlSubmit?.(value)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      handleClose?.()
    }
  }

  const onSelectEvent = (selectedItemOrValue: ListOptionItem | string | null, type?: string) => {
    if (selectedItemOrValue === null) {
      return
    }

    const url = typeof selectedItemOrValue === 'string' ? selectedItemOrValue : selectedItemOrValue.value
    handleUrlSubmit?.(url || '', type)
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent) => {
    if (!event.nativeEvent.isComposing && event.key === 'Enter') {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      handleUrlSubmit?.(target.value)
    }
  }

  const getItem = createLinkSuggestionGetItem({ dataTestId, highlightString: value, onSelect: onSelectEvent })

  if (isLoading) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-md border border-grey-300 p-2 font-sans text-sm leading-snug font-normal text-grey-900 focus-visible:outline-none dark:border-grey-800 dark:bg-grey-900 dark:placeholder:text-grey-800"
        data-testid={`${dataTestId}-loading-container`}
      >
        <div
          className="mr-3 -ml-1 inline-block size-5 animate-spin rounded-full border-4 border-green/20 text-white after:mt-[11px] after:block after:size-1 after:rounded-full after:bg-green/70 after:content-['']"
          data-testid={`${dataTestId}-loading-spinner`}
        ></div>
      </div>
    )
  }

  if (hasError) {
    return (
      <div
        className="min-width-[500px] flex flex-row items-center justify-between rounded-md border border-grey-300 px-3 py-2 text-sm leading-snug font-normal text-grey-900"
        data-testid={`${dataTestId}-error-container`}
      >
        <div>
          <span className="mr-3" data-testid={`${dataTestId}-error-message`}>
            {labels['url.error.message']}
          </span>
          <button
            className="mr-3 cursor-pointer"
            data-testid={`${dataTestId}-error-retry`}
            type="button"
            onClick={handleRetry}
          >
            <span className="font-semibold underline">{labels['action.retry']}</span>
          </button>
          <button
            className="mr-3 cursor-pointer"
            data-testid={`${dataTestId}-error-pasteAsLink`}
            type="button"
            onClick={() => handlePasteAsLink?.(value)}
          >
            <span className="font-semibold underline">{labels['url.error.pasteAsLink']}</span>
          </button>
        </div>
        {handleClose && (
          <button
            className="ml-2 cursor-pointer p-1"
            data-testid={`${dataTestId}-error-close`}
            type="button"
            onClick={handleClose}
          >
            <CloseIcon className="size-4 stroke-2 text-grey-400" />
          </button>
        )}
      </div>
    )
  }

  if (searchEnabled) {
    return (
      <div className="not-inkling-prose" onKeyDown={handleSearchKeyDown}>
        <InputList
          autoFocus={true}
          dataTestId={dataTestId}
          dropdownClassName="z-[-1] w-full overflow-y-auto bg-white px-2 py-1 shadow-md dark:bg-grey-950"
          dropdownPlacementBottomClass="mt-[.6rem] rounded-md"
          dropdownPlacementTopClass="top-[-.6rem] -translate-y-full rounded-md"
          getItem={getItem}
          inputClassName={`w-full rounded-md border border-grey-300 p-2 font-sans text-sm font-normal leading-snug text-grey-900 placeholder:text-sm placeholder:font-medium placeholder:leading-snug placeholder:text-grey-500 focus-visible:outline-none dark:border-grey-800 dark:bg-grey-950 dark:text-grey-100 dark:placeholder:text-grey-800`}
          isLoading={isSearching}
          listOptions={listOptions}
          placeholder={placeholder ?? ''}
          value={value || ''}
          onChange={(inputValue) => handleUrlChange?.(inputValue)}
          onSelect={onSelectEvent}
        />
      </div>
    )
  }

  return (
    <div className="flex w-full items-center rounded-md border border-grey-300 px-3 py-2 text-sm leading-snug font-normal text-grey-900 focus-within:border-green focus-within:bg-white focus-within:shadow-[0_0_0_2px_rgba(48,207,67,.25)] focus-visible:outline-none dark:border-grey-800 dark:bg-grey-900 dark:placeholder:text-grey-800">
      <UrlInputPlugin onEnter={handleUrlSubmit ? () => handleUrlSubmit(value) : undefined} />
      <input
        autoFocus
        className="w-full bg-transparent text-sm outline-none"
        data-testid={dataTestId}
        placeholder={placeholder ?? labels['url.paste.placeholder']}
        type="text"
        value={value ?? ''}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {handleClose && (
        <button className="ml-2 cursor-pointer" data-testid={`${dataTestId}-close`} type="button" onClick={handleClose}>
          ✕
        </button>
      )}
    </div>
  )
}
