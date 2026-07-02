import React from 'react'

import type {
  UnsplashImagePayload,
  UnsplashLinks,
  UnsplashUrls,
  UnsplashUser,
} from '@/ui/inkling-editor/components/ui/file-selectors/Unsplash/types'

import UnsplashButton from '@/ui/inkling-editor/components/ui/file-selectors/Unsplash/UnsplashButton'

interface UnsplashImageProps {
  payload?: UnsplashImagePayload
  srcUrl?: string
  links?: UnsplashLinks
  likes?: number
  user?: UnsplashUser
  alt?: string
  urls?: UnsplashUrls
  height?: number
  width?: number
  zoomed?: UnsplashImagePayload
  insertImage?: (data: UnsplashImagePayload) => void
  selectImg?: (data: UnsplashImagePayload | null) => void
}

function UnsplashImage({
  payload,
  srcUrl,
  links,
  likes,
  user,
  alt,
  urls,
  height,
  width,
  zoomed,
  insertImage,
  selectImg,
}: UnsplashImageProps) {
  return (
    <div
      className={`relative mb-6 block bg-grey-100 ${zoomed ? 'h-full w-[max-content] cursor-zoom-out' : 'w-full cursor-zoom-in'}`}
      data-inkling-unsplash-gallery-item
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        selectImg?.(zoomed ? null : (payload ?? null))
      }}
    >
      <img
        alt={alt}
        className={`${zoomed ? 'h-full w-auto object-contain' : ''}`}
        height={height}
        loading="lazy"
        src={srcUrl}
        width={width}
        data-inkling-unsplash-gallery-img
      />
      <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/5 via-black/5 to-black/30 p-5 opacity-0 transition-all ease-in-out hover:opacity-100">
        <div className="flex items-center justify-end">
          {/* TODO: we may want to pass in the Inkling referral data from consuming app and parse to the urls */}
          <UnsplashButton
            data-inkling-button="unsplash-like"
            href={`${links?.html}/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit`}
            icon="heart"
            label={String(likes ?? 0)}
            rel="noopener noreferrer"
            target="_blank"
          />
          <UnsplashButton
            data-inkling-button="unsplash-download"
            href={`${links?.download}/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit&amp;force=true`}
            icon="download"
            label="Download"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img alt="author" className="mr-2 size-8 rounded-full" src={user?.profile_image?.small} />
            <div className="mr-2 truncate font-sans text-sm font-medium text-white">{user?.name}</div>
          </div>
          <UnsplashButton
            icon="download"
            label="Insert image"
            data-inkling-unsplash-insert-button
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation()
              if (payload && urls?.regular) {
                insertImage?.({
                  ...payload,
                  urls: {
                    ...urls,
                    regular: urls.regular.replace(/&w=1080/, '&w=2000'),
                  },
                })
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default UnsplashImage
