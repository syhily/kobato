import React from 'react'

export interface UrlInputProps {
  dataTestId?: string
  handleClose?: () => void
  handlePasteAsLink?: (href: string) => void
  handleRetry?: () => void
  handleUrlChange?: (eventOrUrl: React.ChangeEvent<HTMLInputElement> | string) => void
  handleUrlSubmit?: (event: React.KeyboardEvent<HTMLInputElement>) => void
  hasError?: boolean
  isLoading?: boolean
  placeholder?: string
  value?: string
}

export function UrlInput({
  dataTestId,
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
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    handleUrlChange?.(event.target.value)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      handleUrlSubmit?.(event)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      handleClose?.()
    }
  }

  React.useEffect(() => {
    if (!hasError) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        handleClose?.()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [hasError, handleClose])

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
            Oops, that link didn&apos;t work.
          </span>
          <button
            className="mr-3 cursor-pointer"
            data-testid={`${dataTestId}-error-retry`}
            type="button"
            onClick={handleRetry}
          >
            <span className="font-semibold underline">Retry</span>
          </button>
          <button
            className="mr-3 cursor-pointer"
            data-testid={`${dataTestId}-error-pasteAsLink`}
            type="button"
            onClick={() => handlePasteAsLink?.(value)}
          >
            <span className="font-semibold underline">Paste URL as link</span>
          </button>
        </div>
        {handleClose && (
          <button
            className="ml-2 cursor-pointer"
            data-testid={`${dataTestId}-error-close`}
            type="button"
            onClick={handleClose}
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full items-center rounded-md border border-grey-300 px-3 py-2 text-sm leading-snug font-normal text-grey-900 focus-within:border-green focus-within:bg-white focus-within:shadow-[0_0_0_2px_rgba(48,207,67,.25)] focus-visible:outline-none dark:border-grey-800 dark:bg-grey-900 dark:placeholder:text-grey-800">
      <input
        autoFocus
        className="w-full bg-transparent text-sm outline-none"
        data-testid={dataTestId}
        placeholder={placeholder ?? 'Paste URL...'}
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
