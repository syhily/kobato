import { type FC, type MouseEvent } from 'react'

import UnsplashButton from '@/ui/inkling-editor/unsplash/ui/UnsplashButton'
import { type InsertImageFn, type Photo, type SelectImgFn, type User } from '@/ui/inkling-editor/unsplash/UnsplashTypes'

export interface UnsplashImageProps {
  payload: Photo
  srcUrl: string
  links: Photo['links']
  likes: number
  user: User
  alt: string
  urls: { regular: string }
  height: number
  width: number
  zoomed: Photo | null
  insertImage: InsertImageFn
  selectImg: SelectImgFn
}

const UnsplashImage: FC<UnsplashImageProps> = ({
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
}) => {
  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    selectImg(zoomed ? null : payload)
  }

  return (
    <div
      className={`relative mb-6 block ${zoomed ? 'h-full w-[max-content] cursor-zoom-out' : 'w-full cursor-zoom-in'}`}
      style={{ backgroundColor: payload.color || 'transparent' }}
      data-inkling-unsplash-gallery-item
      onClick={handleClick}
    >
      <img
        alt={alt}
        className={`${zoomed ? 'h-full w-auto object-contain' : 'block h-auto'}`}
        height={height}
        loading="lazy"
        src={srcUrl}
        width={width}
        data-inkling-unsplash-gallery-img
      />
      <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/5 via-black/5 to-black/30 p-5 opacity-0 transition-all ease-in-out hover:opacity-100">
        <div className="flex items-center justify-end gap-3">
          <UnsplashButton
            data-inkling-button="unsplash-like"
            href={`${links.html}/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit`}
            icon="heart"
            label={likes.toString()}
            rel="noopener noreferrer"
            target="_blank"
          />
          <UnsplashButton
            data-inkling-button="unsplash-download"
            href={`${links.download}/?utm_source=inkling&amp;utm_medium=referral&amp;utm_campaign=api-credit&amp;force=true`}
            icon="download"
          />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img alt="author" className="mr-2 size-8 rounded-full" src={user.profile_image.medium} />
            <div className="mr-2 truncate font-sans text-sm font-medium text-white">{user.name}</div>
          </div>
          <UnsplashButton
            label="Insert image"
            data-inkling-unsplash-insert-button
            onClick={(e) => {
              e.stopPropagation()
              insertImage({
                src: urls.regular.replace(/&w=1080/, '&w=2000'),
                caption: `<span>Photo by <a href="${user.links.html}">${user.name}</a> / <a href="https://unsplash.com/?utm_source=inkling&utm_medium=referral&utm_campaign=api-credit">Unsplash</a></span>`,
                height: height,
                width: width,
                alt: alt,
                links: links,
              })
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default UnsplashImage
