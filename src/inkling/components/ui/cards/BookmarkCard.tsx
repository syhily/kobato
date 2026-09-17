import type { EditorState, LexicalEditor } from 'lexical'

import React from 'react'

import { CardCaptionEditor } from '@/inkling/components/ui/CardCaptionEditor'
import { ReadOnlyOverlay } from '@/inkling/components/ui/ReadOnlyOverlay'
import { UrlInput } from '@/inkling/components/ui/UrlInput'
import { useInklingLabels } from '@/inkling/hooks/useInklingLabels'

interface BookmarkCardProps {
  author?: string
  handleClose: () => void
  handlePasteAsLink: (href: string) => void
  handleRetry: () => void
  handleUrlChange: (value: string) => void
  handleUrlSubmit: (url: string, type?: string) => void
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
}: BookmarkCardProps) {
  const labels = useInklingLabels()
  // State to manage thumbnail visibility
  const [thumbnailVisible, setThumbnailVisible] = React.useState(true)

  const handleThumbnailError = () => {
    setThumbnailVisible(false)
  }

  if (url && !urlError && title) {
    return (
      <div>
        <div
          className="not-inkling-prose border-grey/40 dark:border-grey/20 relative flex min-h-[12rem] w-full rounded-md border bg-transparent font-sans"
          data-testid="bookmark-container"
        >
          <div
            className="flex grow basis-full flex-col items-start justify-start p-5"
            data-testid="bookmark-text-container"
          >
            <div
              className="text-grey-900 dark:text-grey-100 text-[1.5rem] leading-normal font-semibold tracking-normal"
              data-testid="bookmark-title"
            >
              {title}
            </div>
            <div
              className="text-grey-800 dark:text-grey-600 mt-1 line-clamp-2 max-h-[4.4rem] overflow-y-hidden text-sm leading-normal font-normal"
              data-testid="bookmark-description"
            >
              {description}
            </div>
            <div className="text-grey-900 mt-[2rem] flex items-center text-sm leading-9 font-medium">
              {icon && <BookmarkIcon src={icon} />}
              <span
                className=" db text-grey-900 dark:text-grey-100 max-w-[24rem] truncate leading-6"
                data-testid="bookmark-publisher"
              >
                {publisher}
              </span>
              {author && (
                <span
                  className="text-grey-800 before:text-grey-900 dark:text-grey-600 dark:before:text-grey-100 font-normal before:mx-1.5 before:content-['•']"
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
          <ReadOnlyOverlay />
        </div>
        <CardCaptionEditor
          captionEditor={captionEditor}
          captionEditorInitialState={captionEditorInitialState}
          captionPlaceholder={labels['caption.bookmark.placeholder']}
          dataTestId="bookmark-caption"
          isSelected={isSelected}
        />
      </div>
    )
  }

  // the field reads the searchLinks capability from host-integration
  // context itself — this card only supplies the bookmark's handlers and copy
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

interface BookmarkIconProps {
  src?: string
}

export function BookmarkIcon({ src }: BookmarkIconProps) {
  return <img alt="" className="mr-2 size-5 shrink-0" data-testid="bookmark-icon" src={src} />
}
