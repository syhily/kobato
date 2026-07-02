import type { EditorState, LexicalEditor } from 'lexical'

import React from 'react'

import { CardCaptionEditor } from '@/ui/inkling-editor/components/ui/CardCaptionEditor'
import { UrlInput } from '@/ui/inkling-editor/components/ui/UrlInput'
import { UrlSearchInput } from '@/ui/inkling-editor/components/ui/UrlSearchInput'

interface BookmarkCardProps {
  author?: string
  handleClose: () => void
  handlePasteAsLink: (href: string) => void
  handleRetry: () => void
  handleUrlChange: (eventOrUrl: React.ChangeEvent<HTMLInputElement> | string) => void
  handleUrlSubmit: (eventOrUrl: React.KeyboardEvent<HTMLInputElement> | string | null, type?: string) => void
  url?: string
  urlInputValue?: string
  urlPlaceholder?: string
  thumbnail?: string
  title?: string
  description?: string
  icon?: string
  publisher?: string
  captionEditor: LexicalEditor | null
  captionEditorInitialState?: EditorState
  isSelected?: boolean
  isLoading?: boolean
  urlError?: boolean
  searchLinks?: (term?: string) => Promise<unknown>
}

export function BookmarkCard({
  author,
  handleClose,
  handlePasteAsLink,
  handleRetry,
  handleUrlChange,
  handleUrlSubmit,
  url,
  urlInputValue,
  urlPlaceholder,
  thumbnail,
  title,
  description,
  icon,
  publisher,
  captionEditor,
  captionEditorInitialState,
  isSelected,
  isLoading,
  urlError,
  searchLinks,
}: BookmarkCardProps) {
  // State to manage thumbnail visibility
  const [thumbnailVisible, setThumbnailVisible] = React.useState(true)

  const handleThumbnailError = () => {
    setThumbnailVisible(false)
  }

  if (url && !urlError && title) {
    return (
      <div>
        <div
          className="not-inkling-prose relative flex min-h-[120px] w-full rounded-md border border-grey/40 bg-transparent font-sans dark:border-grey/20"
          data-testid="bookmark-container"
        >
          <div
            className="flex grow basis-full flex-col items-start justify-start p-5"
            data-testid="bookmark-text-container"
          >
            <div
              className="text-[1.5rem] leading-normal font-semibold tracking-normal text-grey-900 dark:text-grey-100"
              data-testid="bookmark-title"
            >
              {title}
            </div>
            <div
              className="mt-1 line-clamp-2 max-h-[44px] overflow-y-hidden text-sm leading-normal font-normal text-grey-800 dark:text-grey-600"
              data-testid="bookmark-description"
            >
              {description}
            </div>
            <div className="mt-[20px] flex items-center text-sm leading-9 font-medium text-grey-900">
              {icon && <BookmarkIcon src={icon} />}
              <span
                className=" db max-w-[240px] truncate leading-6 text-grey-900 dark:text-grey-100"
                data-testid="bookmark-publisher"
              >
                {publisher}
              </span>
              {author && (
                <span
                  className="font-normal text-grey-800 before:mx-1.5 before:text-grey-900 before:content-['•'] dark:text-grey-600 dark:before:text-grey-100"
                  data-testid="bookmark-author"
                >
                  {author}
                </span>
              )}
            </div>
          </div>
          {thumbnail && thumbnailVisible && (
            <div className={'relative m-0 min-w-[33%] grow-1'} data-testid="bookmark-thumbnail-container">
              <img
                alt=""
                className="absolute inset-0 size-full rounded-r-[.5rem] object-cover"
                data-testid="bookmark-thumbnail"
                src={thumbnail}
                onError={handleThumbnailError}
              />
            </div>
          )}
          <div className="absolute inset-0 z-50 mt-0"></div>
        </div>
        <CardCaptionEditor
          captionEditor={captionEditor}
          captionEditorInitialState={captionEditorInitialState}
          captionPlaceholder="Type caption for bookmark (optional)"
          dataTestId="bookmark-caption"
          isSelected={isSelected}
        />
      </div>
    )
  }

  if (typeof searchLinks === 'function') {
    return (
      <UrlSearchInput
        dataTestId="bookmark-url"
        handleClose={handleClose}
        handlePasteAsLink={handlePasteAsLink}
        handleRetry={handleRetry}
        handleUrlChange={handleUrlChange}
        handleUrlSubmit={handleUrlSubmit}
        hasError={urlError}
        isLoading={isLoading}
        placeholder={urlPlaceholder}
        searchLinks={searchLinks}
        value={urlInputValue}
      />
    )
  } else {
    return (
      <UrlInput
        dataTestId="bookmark-url"
        handleClose={handleClose}
        handlePasteAsLink={handlePasteAsLink}
        handleRetry={handleRetry}
        handleUrlChange={handleUrlChange}
        handleUrlSubmit={handleUrlSubmit}
        hasError={urlError}
        isLoading={isLoading}
        placeholder={urlPlaceholder}
        value={urlInputValue}
      />
    )
  }
}

interface BookmarkIconProps {
  src?: string
}

export function BookmarkIcon({ src }: BookmarkIconProps) {
  return <img alt="" className="mr-2 size-5 shrink-0" data-testid="bookmark-icon" src={src} />
}
