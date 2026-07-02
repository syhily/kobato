import React from 'react'

export interface GifProps {
  data: {
    id: string
    media_formats?: {
      gif?: { url?: string; dims?: [number, number] }
      tinygif?: { url?: string; dims?: [number, number] }
    }
    title?: string
    [key: string]: unknown
  }
  isHighlighted?: boolean
  onClick?: () => void
  onMouseEnter?: () => void
}

export function Gif({ data, isHighlighted, onClick, onMouseEnter }: GifProps) {
  const gif = data.media_formats?.gif || data.media_formats?.tinygif
  if (!gif) {
    return null
  }

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-md border-2 ${isHighlighted ? 'border-green' : 'border-transparent'}`}
      data-gif-index={data.index}
      data-testid="gif-item"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <img
        alt={data.title ?? 'GIF'}
        className="block size-full object-cover"
        height={gif.dims?.[1]}
        src={gif.url}
        width={gif.dims?.[0]}
      />
    </div>
  )
}
