import React, { useEffect, useRef } from 'react'

import type { GifData } from '@/utils/services/gif'

export interface GifProps {
  data: GifData
  isHighlighted?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
  onFocus?: () => void
  focusRequestId?: string | null
  onFocusRequestHandled?: () => void
}

export function Gif({
  data,
  isHighlighted,
  onClick,
  onMouseEnter,
  onFocus,
  focusRequestId,
  onFocusRequestHandled,
}: GifProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const gif = data.media_formats?.gif || data.media_formats?.tinygif

  useEffect(() => {
    if (isHighlighted && focusRequestId === data.id) {
      if (buttonRef.current && buttonRef.current !== buttonRef.current.ownerDocument.activeElement) {
        buttonRef.current.focus()
      }
      onFocusRequestHandled?.()
    }
  }, [isHighlighted, data.id, focusRequestId, onFocusRequestHandled])

  if (!gif?.url || !gif.dims) {
    return null
  }

  const altText =
    (typeof data.title === 'string' && data.title) ||
    (typeof data.content_description === 'string' && data.content_description) ||
    'GIF'

  return (
    <button
      ref={buttonRef}
      className={`group relative cursor-pointer overflow-hidden rounded-md border-2 bg-transparent p-0 text-left ${isHighlighted ? 'border-green' : 'border-transparent'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green`}
      data-gif-index={data.index}
      data-testid="gif-item"
      tabIndex={isHighlighted ? 0 : -1}
      type="button"
      onClick={onClick}
      onFocus={onFocus}
      onMouseEnter={onMouseEnter}
    >
      <img
        alt={altText}
        className="pointer-events-none block size-full object-cover"
        height={gif.dims[1]}
        src={gif.url}
        width={gif.dims[0]}
      />
    </button>
  )
}
